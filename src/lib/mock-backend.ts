/**
 * Mock backend — stands in for the FastAPI service.
 *
 * It implements the exact HTTP semantics of §9 (404 / 409 / 422 and the same
 * payload shapes) against a browser-local store, so that swapping it for real
 * `fetch` calls only touches `src/lib/api.ts`. All derived numbers come from
 * `src/lib/calc.ts`, which is the same logic the real server must implement.
 */
import { computeBalances, computePairwise, simplifyTransfers, splitEqual } from "./calc";
import { MAX_AMOUNT_CENTS, SUPPORTED_CURRENCIES } from "./money";
import {
  ApiError,
  type Expense,
  type ExpenseInput,
  type ExpenseShare,
  type Group,
  type GroupSnapshot,
  type Member,
  type Settlement,
  type SettlementInput,
} from "./types";

const STORE_KEY = "quits.mockdb.v1";
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford: no I, L, O, U
const MAX_MEMBERS = 8;
const LATENCY_MS = 120;

interface Db {
  groups: Group[];
  members: Member[];
  expenses: Omit<Expense, "shares">[];
  shares: ExpenseShare[];
  settlements: Settlement[];
}

const emptyDb = (): Db => ({
  groups: [],
  members: [],
  expenses: [],
  shares: [],
  settlements: [],
});

let memoryDb: Db | null = null;

function loadDb(): Db {
  if (memoryDb) return memoryDb;
  try {
    if (typeof window !== "undefined") {
      const raw = window.localStorage.getItem(STORE_KEY);
      if (raw) memoryDb = { ...emptyDb(), ...(JSON.parse(raw) as Db) };
    }
  } catch {
    /* fall through to in-memory */
  }
  if (!memoryDb) memoryDb = emptyDb();
  return memoryDb;
}

function saveDb(db: Db): void {
  memoryDb = db;
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(db));
    }
  } catch {
    /* in-memory only for this session */
  }
}

function reloadFromStorage(): Db {
  // Another tab may have written since our last read; the poll picks it up.
  try {
    if (typeof window !== "undefined") {
      const raw = window.localStorage.getItem(STORE_KEY);
      if (raw) {
        memoryDb = { ...emptyDb(), ...(JSON.parse(raw) as Db) };
        return memoryDb;
      }
    }
  } catch {
    /* ignore */
  }
  return loadDb();
}

const nowIso = () => new Date().toISOString();

function uuid(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `id-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function randomCode(): string {
  let out = "";
  for (let i = 0; i < 8; i += 1) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function unprocessable(message: string): never {
  throw new ApiError(422, message);
}

function requireGroup(db: Db, code: string): Group {
  const group = db.groups.find((g) => g.code === code.toUpperCase());
  if (!group) throw new ApiError(404, "Group not found");
  return group;
}

function groupMembers(db: Db, groupId: string): Member[] {
  return db.members
    .filter((m) => m.group_id === groupId)
    .sort((a, b) => a.position - b.position);
}

function hydrateExpenses(db: Db, groupId: string): Expense[] {
  return db.expenses
    .filter((e) => e.group_id === groupId)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .map((e) => ({
      ...e,
      shares: db.shares.filter((s) => s.expense_id === e.id),
    }));
}

function buildSnapshot(db: Db, group: Group): GroupSnapshot {
  const members = groupMembers(db, group.id);
  const expenses = hydrateExpenses(db, group.id);
  const settlements = db.settlements
    .filter((s) => s.group_id === group.id)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const balances = computeBalances(members, expenses, settlements);
  return {
    group,
    members,
    expenses,
    settlements,
    balances,
    suggested_transfers: simplifyTransfers(balances, members),
    pairwise: computePairwise(members, expenses, settlements),
  };
}

function validateAmount(amountCents: number): void {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    unprocessable("Amount must be greater than zero");
  }
  if (amountCents > MAX_AMOUNT_CENTS) unprocessable("Amount is too large");
}

function resolveShares(
  input: ExpenseInput,
  members: Member[],
): { member_id: string; amount_cents: number }[] {
  const byId = new Map(members.map((m) => [m.id, m]));
  if (!byId.has(input.payer_member_id)) unprocessable("Payer is not a member of this group");
  const participants = input.participant_ids.map((id) => {
    const member = byId.get(id);
    if (!member) unprocessable("Participant is not a member of this group");
    return member;
  });
  if (participants.length === 0) unprocessable("Pick at least one participant");

  if (input.split_type === "equal") {
    return splitEqual(input.amount_cents, participants);
  }

  const exact = input.exact_shares ?? [];
  if (exact.length !== participants.length) {
    unprocessable("Every participant needs an exact amount");
  }
  let total = 0;
  for (const share of exact) {
    if (!byId.has(share.member_id)) unprocessable("Unknown participant in shares");
    if (!Number.isInteger(share.amount_cents) || share.amount_cents < 0) {
      unprocessable("Share amounts must be zero or more");
    }
    total += share.amount_cents;
  }
  if (total !== input.amount_cents) {
    unprocessable("Exact shares must add up to the total");
  }
  return exact.map((s) => ({ member_id: s.member_id, amount_cents: s.amount_cents }));
}

function writeShares(db: Db, expenseId: string, shares: { member_id: string; amount_cents: number }[]) {
  db.shares = db.shares.filter((s) => s.expense_id !== expenseId);
  for (const share of shares) {
    db.shares.push({
      id: uuid(),
      expense_id: expenseId,
      member_id: share.member_id,
      amount_cents: share.amount_cents,
    });
  }
}

export const mockBackend = {
  async createGroup(name: string, currency: string): Promise<{ code: string }> {
    await sleep(LATENCY_MS);
    const db = reloadFromStorage();
    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 60) unprocessable("Group name must be 1–60 characters");
    if (!(SUPPORTED_CURRENCIES as readonly string[]).includes(currency)) {
      unprocessable("Only currencies with 2 decimal places are supported");
    }
    let code = randomCode();
    while (db.groups.some((g) => g.code === code)) code = randomCode();
    db.groups.push({ id: uuid(), code, name: trimmed, currency, created_at: nowIso() });
    saveDb(db);
    return { code };
  },

  async getGroup(code: string): Promise<GroupSnapshot> {
    await sleep(LATENCY_MS);
    const db = reloadFromStorage();
    return buildSnapshot(db, requireGroup(db, code));
  },

  async addMember(code: string, name: string): Promise<GroupSnapshot> {
    await sleep(LATENCY_MS);
    const db = reloadFromStorage();
    const group = requireGroup(db, code);
    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 40) unprocessable("Name must be 1–40 characters");
    const existing = groupMembers(db, group.id);
    if (existing.length >= MAX_MEMBERS) unprocessable("A group can hold at most 8 people");
    const nextPosition = existing.reduce((max, m) => Math.max(max, m.position), -1) + 1;
    db.members.push({
      id: uuid(),
      group_id: group.id,
      name: trimmed,
      position: nextPosition,
      created_at: nowIso(),
    });
    saveDb(db);
    return buildSnapshot(db, group);
  },

  async renameMember(code: string, memberId: string, name: string): Promise<GroupSnapshot> {
    await sleep(LATENCY_MS);
    const db = reloadFromStorage();
    const group = requireGroup(db, code);
    const member = db.members.find((m) => m.id === memberId && m.group_id === group.id);
    if (!member) throw new ApiError(404, "Member not found");
    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 40) unprocessable("Name must be 1–40 characters");
    member.name = trimmed;
    saveDb(db);
    return buildSnapshot(db, group);
  },

  async deleteMember(code: string, memberId: string): Promise<GroupSnapshot> {
    await sleep(LATENCY_MS);
    const db = reloadFromStorage();
    const group = requireGroup(db, code);
    const member = db.members.find((m) => m.id === memberId && m.group_id === group.id);
    if (!member) throw new ApiError(404, "Member not found");
    const referenced =
      db.expenses.some((e) => e.group_id === group.id && e.payer_member_id === memberId) ||
      db.shares.some((s) => s.member_id === memberId) ||
      db.settlements.some(
        (s) =>
          s.group_id === group.id &&
          (s.from_member_id === memberId || s.to_member_id === memberId),
      );
    if (referenced) {
      throw new ApiError(409, "This person appears in an expense or payment, so they can't be removed");
    }
    db.members = db.members.filter((m) => m.id !== memberId);
    saveDb(db);
    return buildSnapshot(db, group);
  },

  async createExpense(code: string, input: ExpenseInput): Promise<GroupSnapshot> {
    await sleep(LATENCY_MS);
    const db = reloadFromStorage();
    const group = requireGroup(db, code);
    validateAmount(input.amount_cents);
    const description = input.description.trim();
    if (description.length < 1 || description.length > 120) {
      unprocessable("Description must be 1–120 characters");
    }
    const shares = resolveShares(input, groupMembers(db, group.id));
    const id = uuid();
    const timestamp = nowIso();
    db.expenses.push({
      id,
      group_id: group.id,
      payer_member_id: input.payer_member_id,
      amount_cents: input.amount_cents,
      description,
      date: input.date,
      split_type: input.split_type,
      created_at: timestamp,
      updated_at: timestamp,
    });
    writeShares(db, id, shares);
    saveDb(db);
    return buildSnapshot(db, group);
  },

  async updateExpense(code: string, expenseId: string, input: ExpenseInput): Promise<GroupSnapshot> {
    await sleep(LATENCY_MS);
    const db = reloadFromStorage();
    const group = requireGroup(db, code);
    const expense = db.expenses.find((e) => e.id === expenseId && e.group_id === group.id);
    if (!expense) throw new ApiError(404, "Expense not found");
    validateAmount(input.amount_cents);
    const description = input.description.trim();
    if (description.length < 1 || description.length > 120) {
      unprocessable("Description must be 1–120 characters");
    }
    const shares = resolveShares(input, groupMembers(db, group.id));
    expense.payer_member_id = input.payer_member_id;
    expense.amount_cents = input.amount_cents;
    expense.description = description;
    expense.date = input.date;
    expense.split_type = input.split_type;
    expense.updated_at = nowIso();
    writeShares(db, expense.id, shares);
    saveDb(db);
    return buildSnapshot(db, group);
  },

  async deleteExpense(code: string, expenseId: string): Promise<GroupSnapshot> {
    await sleep(LATENCY_MS);
    const db = reloadFromStorage();
    const group = requireGroup(db, code);
    const expense = db.expenses.find((e) => e.id === expenseId && e.group_id === group.id);
    if (!expense) throw new ApiError(404, "Expense not found");
    db.expenses = db.expenses.filter((e) => e.id !== expenseId);
    db.shares = db.shares.filter((s) => s.expense_id !== expenseId);
    saveDb(db);
    return buildSnapshot(db, group);
  },

  async createSettlement(code: string, input: SettlementInput): Promise<GroupSnapshot> {
    await sleep(LATENCY_MS);
    const db = reloadFromStorage();
    const group = requireGroup(db, code);
    validateSettlement(db, group.id, input);
    const timestamp = nowIso();
    db.settlements.push({
      id: uuid(),
      group_id: group.id,
      from_member_id: input.from_member_id,
      to_member_id: input.to_member_id,
      amount_cents: input.amount_cents,
      date: input.date,
      created_at: timestamp,
      updated_at: timestamp,
    });
    saveDb(db);
    return buildSnapshot(db, group);
  },

  async updateSettlement(
    code: string,
    settlementId: string,
    input: SettlementInput,
  ): Promise<GroupSnapshot> {
    await sleep(LATENCY_MS);
    const db = reloadFromStorage();
    const group = requireGroup(db, code);
    const settlement = db.settlements.find((s) => s.id === settlementId && s.group_id === group.id);
    if (!settlement) throw new ApiError(404, "Payment not found");
    validateSettlement(db, group.id, input);
    settlement.from_member_id = input.from_member_id;
    settlement.to_member_id = input.to_member_id;
    settlement.amount_cents = input.amount_cents;
    settlement.date = input.date;
    settlement.updated_at = nowIso();
    saveDb(db);
    return buildSnapshot(db, group);
  },

  async deleteSettlement(code: string, settlementId: string): Promise<GroupSnapshot> {
    await sleep(LATENCY_MS);
    const db = reloadFromStorage();
    const group = requireGroup(db, code);
    const exists = db.settlements.some((s) => s.id === settlementId && s.group_id === group.id);
    if (!exists) throw new ApiError(404, "Payment not found");
    db.settlements = db.settlements.filter((s) => s.id !== settlementId);
    saveDb(db);
    return buildSnapshot(db, group);
  },
};

function validateSettlement(db: Db, groupId: string, input: SettlementInput): void {
  validateAmount(input.amount_cents);
  if (input.from_member_id === input.to_member_id) {
    unprocessable("A payment needs two different people");
  }
  const ids = new Set(groupMembers(db, groupId).map((m) => m.id));
  if (!ids.has(input.from_member_id) || !ids.has(input.to_member_id)) {
    unprocessable("Both people must be in this group");
  }
}

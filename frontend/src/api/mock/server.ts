/**
 * In-memory mock of the FastAPI backend. Imported ONLY by src/api/client.ts.
 *
 * It implements the behaviour the real server must have (spec §4–§9): the same
 * validation, the same 404 / 409 / 422 errors, shares computed and stored at
 * save time, and a full snapshot returned from every call.
 *
 * The store lives in memory. It is mirrored to localStorage (when available) so
 * that a refresh keeps your data and two tabs of the same browser see each
 * other's changes through the normal 5-second poll — standing in for the shared
 * server database. Delete this folder once client.ts talks to the real backend.
 */
import { computeBalances, computePairwise, simplifyTransfers, splitEqual } from "../../domain/calc";
import { isSupportedCurrency, MAX_AMOUNT_CENTS } from "../../domain/money";
import {
  ApiError,
  type CreateGroupInput,
  type CreateGroupResult,
  type Expense,
  type ExpenseInput,
  type ExpenseShare,
  type Group,
  type GroupSnapshot,
  type Member,
  type Settlement,
  type SettlementInput,
  type ShareInput,
} from "../../types";
import { buildSeedDb } from "./seed";

export interface MockDb {
  groups: Group[];
  members: Member[];
  expenses: Omit<Expense, "shares">[];
  shares: ExpenseShare[];
  settlements: Settlement[];
  /** group id → next member position. Positions are never reused (F2). */
  nextPosition: Record<string, number>;
}

const STORAGE_KEY = "quits.mock-db.v1";
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32: no I, L, O, U
const CODE_LENGTH = 8;
const MAX_MEMBERS = 8;

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

let memoryDb: MockDb | null = null;

function readStorage(): MockDb | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as MockDb) : null;
  } catch {
    return null;
  }
}

function persist(db: MockDb): void {
  memoryDb = db;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // Storage unavailable: the store stays in memory for this tab only.
  }
}

/** Latest copy of the store — re-read so other tabs' writes are picked up. */
function load(): MockDb {
  const stored = readStorage();
  if (stored) {
    memoryDb = stored;
    return stored;
  }
  if (!memoryDb) persist(buildSeedDb());
  return memoryDb as MockDb;
}

export function resetStore(): void {
  persist(buildSeedDb());
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  }
}

const nowIso = () => new Date().toISOString();

function randomCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

function notFound(message: string): never {
  throw new ApiError(404, message);
}

function unprocessable(message: string): never {
  throw new ApiError(422, message);
}

function requireGroup(db: MockDb, code: string): Group {
  return db.groups.find((g) => g.code === code.toUpperCase()) ?? notFound("Group not found");
}

function membersOf(db: MockDb, groupId: string): Member[] {
  return db.members.filter((m) => m.group_id === groupId).sort((a, b) => a.position - b.position);
}

function requireMember(db: MockDb, group: Group, memberId: string): Member {
  return (
    db.members.find((m) => m.id === memberId && m.group_id === group.id) ??
    notFound("Member not found")
  );
}

function snapshot(db: MockDb, group: Group): GroupSnapshot {
  const members = membersOf(db, group.id);
  const expenses: Expense[] = db.expenses
    .filter((e) => e.group_id === group.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((e) => ({ ...e, shares: db.shares.filter((s) => s.expense_id === e.id) }));
  const settlements = db.settlements
    .filter((s) => s.group_id === group.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
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

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validName(raw: string, max: number, label: string): string {
  const name = raw.trim();
  if (name.length < 1 || name.length > max) unprocessable(`${label} must be 1–${max} characters`);
  return name;
}

function validAmount(amountCents: number): number {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    unprocessable("Amount must be greater than zero");
  }
  if (amountCents > MAX_AMOUNT_CENTS) unprocessable("Amount can be at most 1,000,000.00");
  return amountCents;
}

function validDate(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
    unprocessable("Date must be a valid YYYY-MM-DD date");
  }
  return date;
}

/** Computes the share rows to store for an expense (§5 "shares are stored"). */
function resolveShares(input: ExpenseInput, members: Member[]): ShareInput[] {
  const byId = new Map(members.map((m) => [m.id, m]));
  if (!byId.has(input.payer_member_id)) unprocessable("Payer is not a member of this group");

  const participantIds = [...new Set(input.participant_ids)];
  if (participantIds.length === 0) unprocessable("Pick at least one participant");
  const participants = participantIds.map(
    (id) => byId.get(id) ?? unprocessable("Participant is not a member of this group"),
  );

  if (input.split_type === "equal") return splitEqual(input.amount_cents, participants);
  if (input.split_type !== "exact") unprocessable("Split type must be equal or exact");

  const exact = input.exact_shares ?? [];
  const exactIds = new Set(exact.map((s) => s.member_id));
  if (exact.length !== participantIds.length || participantIds.some((id) => !exactIds.has(id))) {
    unprocessable("Every participant needs exactly one exact amount");
  }
  let total = 0;
  for (const share of exact) {
    if (!Number.isSafeInteger(share.amount_cents) || share.amount_cents < 0) {
      unprocessable("Share amounts must be zero or more");
    }
    total += share.amount_cents;
  }
  if (total !== input.amount_cents) unprocessable("Exact amounts must add up to the total");

  const position = new Map(participants.map((p) => [p.id, p.position]));
  return [...exact]
    .sort((a, b) => (position.get(a.member_id) ?? 0) - (position.get(b.member_id) ?? 0))
    .map((s) => ({ member_id: s.member_id, amount_cents: s.amount_cents }));
}

function writeShares(db: MockDb, expenseId: string, shares: ShareInput[]): void {
  db.shares = db.shares.filter((s) => s.expense_id !== expenseId);
  for (const share of shares) {
    db.shares.push({ id: newId(), expense_id: expenseId, ...share });
  }
}

function validSettlement(db: MockDb, group: Group, input: SettlementInput): SettlementInput {
  validAmount(input.amount_cents);
  validDate(input.date);
  if (input.from_member_id === input.to_member_id) {
    unprocessable("A payment needs two different people");
  }
  const ids = new Set(membersOf(db, group.id).map((m) => m.id));
  if (!ids.has(input.from_member_id) || !ids.has(input.to_member_id)) {
    unprocessable("Both people must be members of this group");
  }
  return input;
}

// ---------------------------------------------------------------------------
// Endpoints (one function per route in spec §9)
// ---------------------------------------------------------------------------

export const mockServer = {
  createGroup(input: CreateGroupInput): CreateGroupResult {
    const db = load();
    const name = validName(input.name, 60, "Group name");
    if (!isSupportedCurrency(input.currency)) {
      unprocessable("Only currencies with 2 decimal places are supported");
    }
    let code = randomCode();
    while (db.groups.some((g) => g.code === code)) code = randomCode();
    const id = newId();
    db.groups.push({ id, code, name, currency: input.currency, created_at: nowIso() });
    db.nextPosition[id] = 0;
    persist(db);
    return { code };
  },

  getGroup(code: string): GroupSnapshot {
    const db = load();
    return snapshot(db, requireGroup(db, code));
  },

  addMember(code: string, rawName: string): GroupSnapshot {
    const db = load();
    const group = requireGroup(db, code);
    const name = validName(rawName, 40, "Name");
    if (membersOf(db, group.id).length >= MAX_MEMBERS) {
      unprocessable("A group can have at most 8 people");
    }
    const position = db.nextPosition[group.id] ?? 0;
    db.nextPosition[group.id] = position + 1;
    db.members.push({ id: newId(), group_id: group.id, name, position, created_at: nowIso() });
    persist(db);
    return snapshot(db, group);
  },

  renameMember(code: string, memberId: string, rawName: string): GroupSnapshot {
    const db = load();
    const group = requireGroup(db, code);
    const member = requireMember(db, group, memberId);
    member.name = validName(rawName, 40, "Name");
    persist(db);
    return snapshot(db, group);
  },

  deleteMember(code: string, memberId: string): GroupSnapshot {
    const db = load();
    const group = requireGroup(db, code);
    requireMember(db, group, memberId);
    const groupExpenseIds = new Set(
      db.expenses.filter((e) => e.group_id === group.id).map((e) => e.id),
    );
    const referenced =
      db.expenses.some((e) => e.group_id === group.id && e.payer_member_id === memberId) ||
      db.shares.some((s) => groupExpenseIds.has(s.expense_id) && s.member_id === memberId) ||
      db.settlements.some(
        (s) =>
          s.group_id === group.id && (s.from_member_id === memberId || s.to_member_id === memberId),
      );
    if (referenced) {
      throw new ApiError(
        409,
        "This person is part of an expense or payment, so they can't be removed.",
      );
    }
    db.members = db.members.filter((m) => m.id !== memberId);
    persist(db);
    return snapshot(db, group);
  },

  createExpense(code: string, input: ExpenseInput): GroupSnapshot {
    const db = load();
    const group = requireGroup(db, code);
    validAmount(input.amount_cents);
    const description = validName(input.description, 120, "Description");
    const date = validDate(input.date);
    const shares = resolveShares(input, membersOf(db, group.id));
    const id = newId();
    const timestamp = nowIso();
    db.expenses.push({
      id,
      group_id: group.id,
      payer_member_id: input.payer_member_id,
      amount_cents: input.amount_cents,
      description,
      date,
      split_type: input.split_type,
      created_at: timestamp,
      updated_at: timestamp,
    });
    writeShares(db, id, shares);
    persist(db);
    return snapshot(db, group);
  },

  updateExpense(code: string, expenseId: string, input: ExpenseInput): GroupSnapshot {
    const db = load();
    const group = requireGroup(db, code);
    const expense =
      db.expenses.find((e) => e.id === expenseId && e.group_id === group.id) ??
      notFound("Expense not found");
    validAmount(input.amount_cents);
    const description = validName(input.description, 120, "Description");
    const date = validDate(input.date);
    const shares = resolveShares(input, membersOf(db, group.id));
    Object.assign(expense, {
      payer_member_id: input.payer_member_id,
      amount_cents: input.amount_cents,
      description,
      date,
      split_type: input.split_type,
      updated_at: nowIso(),
    });
    writeShares(db, expense.id, shares);
    persist(db);
    return snapshot(db, group);
  },

  deleteExpense(code: string, expenseId: string): GroupSnapshot {
    const db = load();
    const group = requireGroup(db, code);
    if (!db.expenses.some((e) => e.id === expenseId && e.group_id === group.id)) {
      notFound("Expense not found");
    }
    db.expenses = db.expenses.filter((e) => e.id !== expenseId);
    db.shares = db.shares.filter((s) => s.expense_id !== expenseId); // cascade
    persist(db);
    return snapshot(db, group);
  },

  createSettlement(code: string, input: SettlementInput): GroupSnapshot {
    const db = load();
    const group = requireGroup(db, code);
    const valid = validSettlement(db, group, input);
    const timestamp = nowIso();
    db.settlements.push({
      id: newId(),
      group_id: group.id,
      from_member_id: valid.from_member_id,
      to_member_id: valid.to_member_id,
      amount_cents: valid.amount_cents,
      date: valid.date,
      created_at: timestamp,
      updated_at: timestamp,
    });
    persist(db);
    return snapshot(db, group);
  },

  updateSettlement(code: string, settlementId: string, input: SettlementInput): GroupSnapshot {
    const db = load();
    const group = requireGroup(db, code);
    const settlement =
      db.settlements.find((s) => s.id === settlementId && s.group_id === group.id) ??
      notFound("Payment not found");
    const valid = validSettlement(db, group, input);
    Object.assign(settlement, {
      from_member_id: valid.from_member_id,
      to_member_id: valid.to_member_id,
      amount_cents: valid.amount_cents,
      date: valid.date,
      updated_at: nowIso(),
    });
    persist(db);
    return snapshot(db, group);
  },

  deleteSettlement(code: string, settlementId: string): GroupSnapshot {
    const db = load();
    const group = requireGroup(db, code);
    if (!db.settlements.some((s) => s.id === settlementId && s.group_id === group.id)) {
      notFound("Payment not found");
    }
    db.settlements = db.settlements.filter((s) => s.id !== settlementId);
    persist(db);
    return snapshot(db, group);
  },
};

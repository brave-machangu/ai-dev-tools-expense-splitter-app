/**
 * Split and balance maths from spec §7. Pure functions over integer cents.
 *
 * The mock server uses these to build snapshots; the FastAPI backend must
 * implement the same rules so both produce byte-identical numbers.
 */
import type { Balance, Expense, Member, Settlement, ShareInput, Transfer } from "../types";

/**
 * §7.1 Equal split: floor division, then the remainder is handed out one minor
 * unit at a time in ascending member position. £10.00 / 3 → 334, 333, 333.
 */
export function splitEqual(
  totalCents: number,
  participants: Pick<Member, "id" | "position">[],
): ShareInput[] {
  const ordered = [...participants].sort((a, b) => a.position - b.position);
  const n = ordered.length;
  if (n === 0) return [];
  const base = Math.floor(totalCents / n);
  const remainder = totalCents - base * n;
  return ordered.map((p, index) => ({
    member_id: p.id,
    amount_cents: base + (index < remainder ? 1 : 0),
  }));
}

/** §7.2 net = paid − own shares + settlements paid − settlements received */
export function computeBalances(
  members: Member[],
  expenses: Expense[],
  settlements: Settlement[],
): Balance[] {
  const net = new Map<string, number>(members.map((m) => [m.id, 0]));
  const bump = (memberId: string, delta: number) => {
    const current = net.get(memberId);
    if (current !== undefined) net.set(memberId, current + delta);
  };

  for (const expense of expenses) {
    bump(expense.payer_member_id, expense.amount_cents);
    for (const share of expense.shares) bump(share.member_id, -share.amount_cents);
  }
  for (const settlement of settlements) {
    bump(settlement.from_member_id, settlement.amount_cents);
    bump(settlement.to_member_id, -settlement.amount_cents);
  }

  return [...members]
    .sort((a, b) => a.position - b.position)
    .map((m) => ({ member_id: m.id, net_cents: net.get(m.id) ?? 0 }));
}

/**
 * §7.3 Greedy: largest debtor pays largest creditor, sorted by absolute amount
 * descending and tie-broken by ascending position, until everyone is at zero.
 */
export function simplifyTransfers(balances: Balance[], members: Member[]): Transfer[] {
  const position = new Map(members.map((m) => [m.id, m.position]));
  type Entry = { member_id: string; amount: number };
  const byAmountThenPosition = (a: Entry, b: Entry) =>
    b.amount - a.amount || (position.get(a.member_id) ?? 0) - (position.get(b.member_id) ?? 0);

  const debtors: Entry[] = balances
    .filter((b) => b.net_cents < 0)
    .map((b) => ({ member_id: b.member_id, amount: -b.net_cents }))
    .sort(byAmountThenPosition);
  const creditors: Entry[] = balances
    .filter((b) => b.net_cents > 0)
    .map((b) => ({ member_id: b.member_id, amount: b.net_cents }))
    .sort(byAmountThenPosition);

  const transfers: Transfer[] = [];
  let d = 0;
  let c = 0;
  while (d < debtors.length && c < creditors.length) {
    const debtor = debtors[d];
    const creditor = creditors[c];
    if (!debtor || !creditor) break;

    const amount = Math.min(debtor.amount, creditor.amount);
    transfers.push({
      from_member_id: debtor.member_id,
      to_member_id: creditor.member_id,
      amount_cents: amount,
    });
    debtor.amount -= amount;
    creditor.amount -= amount;
    if (debtor.amount === 0) d += 1;
    if (creditor.amount === 0) c += 1;
  }
  return transfers;
}

/**
 * §7.4 Raw pairwise: every participant owes their share to the payer; reciprocal
 * pairs are netted; settlements between the same two people are applied. Derived
 * from expense and settlement rows only — never from the greedy output.
 */
export function computePairwise(
  members: Member[],
  expenses: Expense[],
  settlements: Settlement[],
): Transfer[] {
  const owed = new Map<string, number>();
  const key = (from: string, to: string) => `${from}→${to}`;
  const add = (from: string, to: string, amount: number) => {
    if (from === to) return;
    owed.set(key(from, to), (owed.get(key(from, to)) ?? 0) + amount);
  };

  for (const expense of expenses) {
    for (const share of expense.shares) {
      add(share.member_id, expense.payer_member_id, share.amount_cents);
    }
  }
  // Paying someone reduces what you owe them — equivalent to them owing you.
  for (const s of settlements) add(s.to_member_id, s.from_member_id, s.amount_cents);

  const ordered = [...members].sort((a, b) => a.position - b.position);
  const result: Transfer[] = [];
  for (let i = 0; i < ordered.length; i += 1) {
    for (let j = i + 1; j < ordered.length; j += 1) {
      const a = ordered[i]?.id;
      const b = ordered[j]?.id;
      if (!a || !b) continue;
      const net = (owed.get(key(a, b)) ?? 0) - (owed.get(key(b, a)) ?? 0);
      if (net > 0) result.push({ from_member_id: a, to_member_id: b, amount_cents: net });
      if (net < 0) result.push({ from_member_id: b, to_member_id: a, amount_cents: -net });
    }
  }
  return result;
}

/** "All settled up" is computed, never stored (F6). */
export function isAllSettled(balances: Balance[]): boolean {
  return balances.every((b) => b.net_cents === 0);
}

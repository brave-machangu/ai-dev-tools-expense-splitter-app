import type { Balance, Expense, Member, Settlement, Transfer } from "./types";

/**
 * §7.1 Equal split: floor division, remainder handed out one minor unit at a
 * time in ascending member position. Deterministic by construction.
 */
export function splitEqual(
  totalCents: number,
  participants: { id: string; position: number }[],
): { member_id: string; amount_cents: number }[] {
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

/** §7.2 net = paid − owed + settlements paid − settlements received */
export function computeBalances(
  members: Member[],
  expenses: Expense[],
  settlements: Settlement[],
): Balance[] {
  const net = new Map<string, number>();
  for (const m of members) net.set(m.id, 0);
  const bump = (id: string, delta: number) => {
    if (!net.has(id)) return;
    net.set(id, (net.get(id) ?? 0) + delta);
  };

  for (const expense of expenses) {
    bump(expense.payer_member_id, expense.amount_cents);
    for (const share of expense.shares) bump(share.member_id, -share.amount_cents);
  }
  for (const s of settlements) {
    bump(s.from_member_id, s.amount_cents);
    bump(s.to_member_id, -s.amount_cents);
  }

  return members.map((m) => ({ member_id: m.id, net_cents: net.get(m.id) ?? 0 }));
}

/** §7.3 Greedy largest-debtor → largest-creditor, tie-broken by position. */
export function simplifyTransfers(balances: Balance[], members: Member[]): Transfer[] {
  const position = new Map(members.map((m) => [m.id, m.position]));
  const order = (
    a: { member_id: string; amount: number },
    b: { member_id: string; amount: number },
  ) =>
    b.amount - a.amount ||
    (position.get(a.member_id) ?? 0) - (position.get(b.member_id) ?? 0);

  const debtors = balances
    .filter((b) => b.net_cents < 0)
    .map((b) => ({ member_id: b.member_id, amount: -b.net_cents }))
    .sort(order);
  const creditors = balances
    .filter((b) => b.net_cents > 0)
    .map((b) => ({ member_id: b.member_id, amount: b.net_cents }))
    .sort(order);

  const transfers: Transfer[] = [];
  let d = 0;
  let c = 0;
  while (d < debtors.length && c < creditors.length) {
    const debtor = debtors[d];
    const creditor = creditors[c];
    const amount = Math.min(debtor.amount, creditor.amount);
    if (amount > 0) {
      transfers.push({
        from_member_id: debtor.member_id,
        to_member_id: creditor.member_id,
        amount_cents: amount,
      });
    }
    debtor.amount -= amount;
    creditor.amount -= amount;
    if (debtor.amount === 0) d += 1;
    if (creditor.amount === 0) c += 1;
  }
  return transfers;
}

/**
 * §7.4 Raw pairwise: derived from expense shares alone, then settlements
 * applied between the same two members. Never reads the greedy output.
 */
export function computePairwise(
  members: Member[],
  expenses: Expense[],
  settlements: Settlement[],
): Transfer[] {
  const owes = new Map<string, number>();
  const key = (from: string, to: string) => `${from}|${to}`;
  const add = (from: string, to: string, amount: number) => {
    if (from === to) return;
    owes.set(key(from, to), (owes.get(key(from, to)) ?? 0) + amount);
  };

  for (const expense of expenses) {
    for (const share of expense.shares) {
      add(share.member_id, expense.payer_member_id, share.amount_cents);
    }
  }
  for (const s of settlements) add(s.to_member_id, s.from_member_id, s.amount_cents);

  const ordered = [...members].sort((a, b) => a.position - b.position);
  const result: Transfer[] = [];
  for (let i = 0; i < ordered.length; i += 1) {
    for (let j = i + 1; j < ordered.length; j += 1) {
      const a = ordered[i].id;
      const b = ordered[j].id;
      const netted = (owes.get(key(a, b)) ?? 0) - (owes.get(key(b, a)) ?? 0);
      if (netted > 0) {
        result.push({ from_member_id: a, to_member_id: b, amount_cents: netted });
      } else if (netted < 0) {
        result.push({ from_member_id: b, to_member_id: a, amount_cents: -netted });
      }
    }
  }
  return result;
}

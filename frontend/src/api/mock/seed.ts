/**
 * Sample data so the app isn't empty on first load: one group, four people,
 * five expenses (equal and exact splits, one with a rounding remainder) and one
 * recorded payment. Open it at /g/TR1P2026.
 */
import { splitEqual } from "../../domain/calc";
import type { Expense, ExpenseShare, Group, Member, Settlement, ShareInput } from "../../types";
import type { MockDb } from "./server";

export const SAMPLE_GROUP_CODE = "TR1P2026";

const DAY_MS = 24 * 60 * 60 * 1000;

function seedId(prefix: string, n: number): string {
  return `seed-${prefix}-${String(n).padStart(4, "0")}`;
}

export function buildSeedDb(): MockDb {
  const now = Date.now();
  const at = (daysAgo: number, minutes = 0) =>
    new Date(now - daysAgo * DAY_MS + minutes * 60_000).toISOString();
  const day = (daysAgo: number) => at(daysAgo).slice(0, 10);

  const group: Group = {
    id: seedId("group", 1),
    code: SAMPLE_GROUP_CODE,
    name: "Lisbon weekend",
    currency: "EUR",
    created_at: at(5),
  };

  const names = ["Priya", "Sam", "Ana", "Carl"];
  const members: Member[] = names.map((name, position) => ({
    id: seedId("member", position + 1),
    group_id: group.id,
    name,
    position,
    created_at: at(5, position + 1),
  }));
  const [priya, sam, ana, carl] = members as [Member, Member, Member, Member];

  const expenses: Omit<Expense, "shares">[] = [];
  const shares: ExpenseShare[] = [];

  const addExpense = (
    daysAgo: number,
    payer: Member,
    amountCents: number,
    description: string,
    split: { type: "equal"; participants: Member[] } | { type: "exact"; shares: ShareInput[] },
  ) => {
    const id = seedId("expense", expenses.length + 1);
    const timestamp = at(daysAgo, 30 + expenses.length);
    expenses.push({
      id,
      group_id: group.id,
      payer_member_id: payer.id,
      amount_cents: amountCents,
      description,
      date: day(daysAgo),
      split_type: split.type,
      created_at: timestamp,
      updated_at: timestamp,
    });
    const rows =
      split.type === "equal" ? splitEqual(amountCents, split.participants) : split.shares;
    for (const row of rows) {
      shares.push({ id: seedId("share", shares.length + 1), expense_id: id, ...row });
    }
  };

  addExpense(4, priya, 48000, "Villa deposit", { type: "equal", participants: members });
  // 36.50 across three → 12.17 / 12.17 / 12.16 (remainder by position)
  addExpense(4, sam, 3650, "Taxis from the airport", {
    type: "equal",
    participants: [priya, sam, carl],
  });
  // 62.35 across four → 15.59 / 15.59 / 15.59 / 15.58
  addExpense(3, ana, 6235, "Groceries & wine", { type: "equal", participants: members });
  addExpense(3, ana, 18000, "Boat tour", { type: "equal", participants: members });
  // Ana wasn't at Tuesday dinner; Sam had the extra course.
  addExpense(2, carl, 9400, "Tuesday dinner", {
    type: "exact",
    shares: [
      { member_id: priya.id, amount_cents: 3000 },
      { member_id: sam.id, amount_cents: 3400 },
      { member_id: carl.id, amount_cents: 3000 },
    ],
  });

  const settlements: Settlement[] = [
    {
      id: seedId("settlement", 1),
      group_id: group.id,
      from_member_id: sam.id,
      to_member_id: priya.id,
      amount_cents: 5000,
      date: day(1),
      created_at: at(1),
      updated_at: at(1),
    },
  ];

  return {
    groups: [group],
    members,
    expenses,
    shares,
    settlements,
    nextPosition: { [group.id]: members.length },
  };
}

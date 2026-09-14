export type SplitType = "equal" | "exact";

export interface Group {
  id: string;
  code: string;
  name: string;
  currency: string;
  created_at: string;
}

export interface Member {
  id: string;
  group_id: string;
  name: string;
  position: number;
  created_at: string;
}

export interface ExpenseShare {
  id: string;
  expense_id: string;
  member_id: string;
  amount_cents: number;
}

export interface Expense {
  id: string;
  group_id: string;
  payer_member_id: string;
  amount_cents: number;
  description: string;
  date: string;
  split_type: SplitType;
  shares: ExpenseShare[];
  created_at: string;
  updated_at: string;
}

export interface Settlement {
  id: string;
  group_id: string;
  from_member_id: string;
  to_member_id: string;
  amount_cents: number;
  date: string;
  created_at: string;
  updated_at: string;
}

export interface Balance {
  member_id: string;
  net_cents: number;
}

export interface Transfer {
  from_member_id: string;
  to_member_id: string;
  amount_cents: number;
}

export interface GroupSnapshot {
  group: Group;
  members: Member[];
  expenses: Expense[];
  settlements: Settlement[];
  balances: Balance[];
  suggested_transfers: Transfer[];
  pairwise: Transfer[];
}

export interface ExpenseInput {
  payer_member_id: string;
  amount_cents: number;
  description: string;
  date: string;
  split_type: SplitType;
  participant_ids: string[];
  exact_shares?: { member_id: string; amount_cents: number }[] | undefined;
}

export interface SettlementInput {
  from_member_id: string;
  to_member_id: string;
  amount_cents: number;
  date: string;
}

/** Mirrors the HTTP contract in the spec: 404 / 409 / 422. */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

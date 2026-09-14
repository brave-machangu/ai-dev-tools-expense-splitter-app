/**
 * Every domain and API type for the app lives here, and only here.
 *
 * Field names are snake_case on purpose: they mirror the data model in
 * _docs/specs.md §5 and the JSON the FastAPI backend will return, so swapping
 * the mock for real HTTP calls needs no mapping layer.
 *
 * All money fields are integer minor units (cents). All timestamps are ISO-8601
 * UTC strings; `date` fields are "YYYY-MM-DD".
 */

export type SplitType = "equal" | "exact";

export interface Group {
  id: string;
  /** 8-char Crockford base32 code, the group's URL: /g/{code} */
  code: string;
  name: string;
  /** ISO 4217, from SUPPORTED_CURRENCIES */
  currency: string;
  created_at: string;
}

export interface Member {
  id: string;
  group_id: string;
  name: string;
  /** Monotonic, never reused. Tie-break for rounding and simplification. */
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
  /** Stored per-person amounts; always sum to amount_cents. */
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

/** Positive: the group owes this member. Negative: they owe the group. */
export interface Balance {
  member_id: string;
  net_cents: number;
}

export interface Transfer {
  from_member_id: string;
  to_member_id: string;
  amount_cents: number;
}

/** Response of GET /api/groups/{code} — and of every mutation. */
export interface GroupSnapshot {
  group: Group;
  members: Member[];
  expenses: Expense[];
  settlements: Settlement[];
  balances: Balance[];
  suggested_transfers: Transfer[];
  pairwise: Transfer[];
}

// ---------------------------------------------------------------------------
// Request bodies
// ---------------------------------------------------------------------------

export interface CreateGroupInput {
  name: string;
  currency: string;
}

export interface CreateGroupResult {
  code: string;
}

export interface ShareInput {
  member_id: string;
  amount_cents: number;
}

export interface ExpenseInput {
  payer_member_id: string;
  amount_cents: number;
  description: string;
  date: string;
  split_type: SplitType;
  participant_ids: string[];
  /** Required when split_type is "exact"; one entry per participant. */
  exact_shares?: ShareInput[];
}

export interface SettlementInput {
  from_member_id: string;
  to_member_id: string;
  amount_cents: number;
  date: string;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * HTTP status of a failed call — the API uses 404, 409 and 422 (spec §9) — or
 * 0 when no response arrived (server unreachable or timed out).
 */
export type ApiErrorStatus = number;

export class ApiError extends Error {
  readonly status: ApiErrorStatus;

  constructor(status: ApiErrorStatus, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

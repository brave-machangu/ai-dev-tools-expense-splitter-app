/**
 * THE API client. Every backend call in the frontend goes through this module;
 * nothing else may use fetch or reach into ./mock (ESLint enforces it).
 *
 * Today each method is served by the in-memory mock server with simulated
 * network latency. To connect the real FastAPI backend, replace each body with
 * the HTTP call named in its comment — signatures and return types stay the same
 * — then delete ./mock.
 */
import {
  ApiError,
  type CreateGroupInput,
  type CreateGroupResult,
  type ExpenseInput,
  type GroupSnapshot,
  type SettlementInput,
} from "../types";
import { mockServer, resetStore } from "./mock/server";
import { SAMPLE_GROUP_CODE } from "./mock/seed";

/** Simulated round-trip time, in milliseconds. */
const LATENCY_MIN_MS = 180;
const LATENCY_MAX_MS = 550;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Runs a mock endpoint as if it were a network request: waits a realistic,
 * jittered delay, then returns a deep copy (so the UI can never mutate the
 * store) or rejects with an ApiError.
 */
async function request<T>(handler: () => T): Promise<T> {
  await sleep(LATENCY_MIN_MS + Math.random() * (LATENCY_MAX_MS - LATENCY_MIN_MS));
  try {
    return structuredClone(handler());
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Something went wrong. Please try again.");
  }
}

export const api = {
  /** POST /api/groups */
  createGroup: (input: CreateGroupInput): Promise<CreateGroupResult> =>
    request(() => mockServer.createGroup(input)),

  /** GET /api/groups/{code} — full snapshot, used by the 5-second poll */
  getGroup: (code: string): Promise<GroupSnapshot> => request(() => mockServer.getGroup(code)),

  /** POST /api/groups/{code}/members */
  addMember: (code: string, name: string): Promise<GroupSnapshot> =>
    request(() => mockServer.addMember(code, name)),

  /** PATCH /api/groups/{code}/members/{id} */
  renameMember: (code: string, memberId: string, name: string): Promise<GroupSnapshot> =>
    request(() => mockServer.renameMember(code, memberId, name)),

  /** DELETE /api/groups/{code}/members/{id} — 409 if referenced */
  deleteMember: (code: string, memberId: string): Promise<GroupSnapshot> =>
    request(() => mockServer.deleteMember(code, memberId)),

  /** POST /api/groups/{code}/expenses */
  createExpense: (code: string, input: ExpenseInput): Promise<GroupSnapshot> =>
    request(() => mockServer.createExpense(code, input)),

  /** PUT /api/groups/{code}/expenses/{id} */
  updateExpense: (code: string, expenseId: string, input: ExpenseInput): Promise<GroupSnapshot> =>
    request(() => mockServer.updateExpense(code, expenseId, input)),

  /** DELETE /api/groups/{code}/expenses/{id} */
  deleteExpense: (code: string, expenseId: string): Promise<GroupSnapshot> =>
    request(() => mockServer.deleteExpense(code, expenseId)),

  /** POST /api/groups/{code}/settlements */
  createSettlement: (code: string, input: SettlementInput): Promise<GroupSnapshot> =>
    request(() => mockServer.createSettlement(code, input)),

  /** PUT /api/groups/{code}/settlements/{id} */
  updateSettlement: (
    code: string,
    settlementId: string,
    input: SettlementInput,
  ): Promise<GroupSnapshot> =>
    request(() => mockServer.updateSettlement(code, settlementId, input)),

  /** DELETE /api/groups/{code}/settlements/{id} */
  deleteSettlement: (code: string, settlementId: string): Promise<GroupSnapshot> =>
    request(() => mockServer.deleteSettlement(code, settlementId)),
};

/**
 * Development-only helpers for the mock. Not part of the real API — remove
 * together with ./mock when the backend is connected.
 */
export const mockTools = {
  sampleGroupCode: SAMPLE_GROUP_CODE,
  resetData: (): Promise<void> => request(() => resetStore()),
};

/** Human-readable message for any error thrown by `api`. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return "Something went wrong. Please try again.";
}

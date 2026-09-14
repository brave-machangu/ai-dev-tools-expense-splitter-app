/**
 * THE API client. Every backend call in the frontend goes through this module;
 * nothing else may use fetch (ESLint enforces it).
 *
 * Talks to the FastAPI backend described in openapi.yaml. The base URL
 * comes from VITE_API_BASE_URL (see frontend/.env.example). Every failure —
 * an HTTP error, an unreachable server or a timeout — rejects with an ApiError
 * whose message can be shown to the user as-is.
 */
import {
  ApiError,
  type CreateGroupInput,
  type CreateGroupResult,
  type ExpenseInput,
  type GroupSnapshot,
  type SettlementInput,
} from "../types";

const DEFAULT_API_BASE_URL = "http://localhost:8000";

export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL
).replace(/\/+$/, "");

/** Give up on a request after this long, so the UI never waits forever. */
const REQUEST_TIMEOUT_MS = 15_000;

const GENERIC_ERROR = "Something went wrong. Please try again.";
const UNREACHABLE_ERROR = "Can't reach the server. Check your connection and try again.";
const TIMEOUT_ERROR = "The server took too long to respond. Please try again.";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Builds a path with each dynamic segment URL-encoded. */
function path(strings: TemplateStringsArray, ...segments: string[]): string {
  return strings.reduce(
    (result, part, i) =>
      result + part + (i < segments.length ? encodeURIComponent(segments[i] ?? "") : ""),
    "",
  );
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Turns an error body into one readable sentence. The backend sends
 * `{"detail": "message"}` for rule violations and FastAPI's list of issues for
 * schema validation failures (openapi.yaml `ValidationError`).
 */
function detailMessage(payload: unknown, status: number): string {
  const detail =
    payload && typeof payload === "object" && "detail" in payload ? payload.detail : undefined;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const first: unknown = detail[0];
    if (first && typeof first === "object" && "msg" in first && typeof first.msg === "string") {
      return first.msg.replace(/^Value error, /, "");
    }
  }
  if (status === 404) return "That couldn't be found. It may have been deleted.";
  if (status === 409) return "That change conflicts with existing data.";
  if (status === 422) return "Some of the details aren't valid. Please check and try again.";
  return GENERIC_ERROR;
}

async function request<T>(method: Method, url: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${url}`, {
      method,
      headers:
        body === undefined
          ? { Accept: "application/json" }
          : { Accept: "application/json", "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    throw new ApiError(0, timedOut ? TIMEOUT_ERROR : UNREACHABLE_ERROR);
  }

  const payload = await readJson(response);
  if (!response.ok) throw new ApiError(response.status, detailMessage(payload, response.status));
  if (payload === undefined) throw new ApiError(response.status, GENERIC_ERROR);
  return payload as T;
}

export const api = {
  /** POST /api/groups */
  createGroup: (input: CreateGroupInput): Promise<CreateGroupResult> =>
    request("POST", "/api/groups", input),

  /** GET /api/groups/{code} — full snapshot, used by the 5-second poll */
  getGroup: (code: string): Promise<GroupSnapshot> => request("GET", path`/api/groups/${code}`),

  /** POST /api/groups/{code}/members */
  addMember: (code: string, name: string): Promise<GroupSnapshot> =>
    request("POST", path`/api/groups/${code}/members`, { name }),

  /** PATCH /api/groups/{code}/members/{id} */
  renameMember: (code: string, memberId: string, name: string): Promise<GroupSnapshot> =>
    request("PATCH", path`/api/groups/${code}/members/${memberId}`, { name }),

  /** DELETE /api/groups/{code}/members/{id} — 409 if referenced */
  deleteMember: (code: string, memberId: string): Promise<GroupSnapshot> =>
    request("DELETE", path`/api/groups/${code}/members/${memberId}`),

  /** POST /api/groups/{code}/expenses */
  createExpense: (code: string, input: ExpenseInput): Promise<GroupSnapshot> =>
    request("POST", path`/api/groups/${code}/expenses`, input),

  /** PUT /api/groups/{code}/expenses/{id} */
  updateExpense: (code: string, expenseId: string, input: ExpenseInput): Promise<GroupSnapshot> =>
    request("PUT", path`/api/groups/${code}/expenses/${expenseId}`, input),

  /** DELETE /api/groups/{code}/expenses/{id} */
  deleteExpense: (code: string, expenseId: string): Promise<GroupSnapshot> =>
    request("DELETE", path`/api/groups/${code}/expenses/${expenseId}`),

  /** POST /api/groups/{code}/settlements */
  createSettlement: (code: string, input: SettlementInput): Promise<GroupSnapshot> =>
    request("POST", path`/api/groups/${code}/settlements`, input),

  /** PUT /api/groups/{code}/settlements/{id} */
  updateSettlement: (
    code: string,
    settlementId: string,
    input: SettlementInput,
  ): Promise<GroupSnapshot> =>
    request("PUT", path`/api/groups/${code}/settlements/${settlementId}`, input),

  /** DELETE /api/groups/{code}/settlements/{id} */
  deleteSettlement: (code: string, settlementId: string): Promise<GroupSnapshot> =>
    request("DELETE", path`/api/groups/${code}/settlements/${settlementId}`),
};

/** Human-readable message for any error thrown by `api`. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return GENERIC_ERROR;
}

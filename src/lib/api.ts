/**
 * The single API module. Nothing else in the app performs data access.
 *
 * Today every call is served by `mockBackend`, which mirrors the HTTP contract
 * from the spec (§9). To point at the real backend, replace each body with the
 * matching `fetch` call — the signatures and return shapes stay identical.
 *
 *   POST   /api/groups
 *   GET    /api/groups/{code}
 *   POST   /api/groups/{code}/members
 *   PATCH  /api/groups/{code}/members/{id}
 *   DELETE /api/groups/{code}/members/{id}
 *   POST   /api/groups/{code}/expenses
 *   PUT    /api/groups/{code}/expenses/{id}
 *   DELETE /api/groups/{code}/expenses/{id}
 *   POST   /api/groups/{code}/settlements
 *   PUT    /api/groups/{code}/settlements/{id}
 *   DELETE /api/groups/{code}/settlements/{id}
 */
import { mockBackend } from "./mock-backend";
import type { ExpenseInput, GroupSnapshot, SettlementInput } from "./types";

export const api = {
  createGroup: (name: string, currency: string): Promise<{ code: string }> =>
    mockBackend.createGroup(name, currency),

  getGroup: (code: string): Promise<GroupSnapshot> => mockBackend.getGroup(code),

  addMember: (code: string, name: string): Promise<GroupSnapshot> =>
    mockBackend.addMember(code, name),

  renameMember: (code: string, memberId: string, name: string): Promise<GroupSnapshot> =>
    mockBackend.renameMember(code, memberId, name),

  deleteMember: (code: string, memberId: string): Promise<GroupSnapshot> =>
    mockBackend.deleteMember(code, memberId),

  createExpense: (code: string, input: ExpenseInput): Promise<GroupSnapshot> =>
    mockBackend.createExpense(code, input),

  updateExpense: (code: string, expenseId: string, input: ExpenseInput): Promise<GroupSnapshot> =>
    mockBackend.updateExpense(code, expenseId, input),

  deleteExpense: (code: string, expenseId: string): Promise<GroupSnapshot> =>
    mockBackend.deleteExpense(code, expenseId),

  createSettlement: (code: string, input: SettlementInput): Promise<GroupSnapshot> =>
    mockBackend.createSettlement(code, input),

  updateSettlement: (
    code: string,
    settlementId: string,
    input: SettlementInput,
  ): Promise<GroupSnapshot> => mockBackend.updateSettlement(code, settlementId, input),

  deleteSettlement: (code: string, settlementId: string): Promise<GroupSnapshot> =>
    mockBackend.deleteSettlement(code, settlementId),
};

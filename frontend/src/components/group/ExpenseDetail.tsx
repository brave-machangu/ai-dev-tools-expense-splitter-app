import { useState } from "react";

import { api, errorMessage } from "../../api/client";
import { formatMoney } from "../../domain/money";
import { formatDate } from "../../lib/dates";
import { memberName, subject } from "../../lib/people";
import type { Expense, GroupSnapshot } from "../../types";
import { ConfirmButton } from "../ConfirmButton";

interface ExpenseDetailProps {
  snapshot: GroupSnapshot;
  meId: string | null;
  expense: Expense;
  onEdit: () => void;
  onDeleted: (snapshot: GroupSnapshot) => void;
}

/** Exactly what each person was charged — rounding is never silent (§7.1). */
export function ExpenseDetail({ snapshot, meId, expense, onEdit, onDeleted }: ExpenseDetailProps) {
  const { group, members } = snapshot;
  const currency = group.currency;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const position = new Map(members.map((m) => [m.id, m.position]));
  const shares = [...expense.shares].sort(
    (a, b) => (position.get(a.member_id) ?? 0) - (position.get(b.member_id) ?? 0),
  );
  const shareTotal = shares.reduce((sum, s) => sum + s.amount_cents, 0);
  const amounts = new Set(shares.map((s) => s.amount_cents));
  const roundedEqual = expense.split_type === "equal" && amounts.size > 1;

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      onDeleted(await api.deleteExpense(group.code, expense.id));
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <div className="detail-summary">
        <p className="detail-amount money">{formatMoney(expense.amount_cents, currency)}</p>
        <p className="muted">
          {subject(members, expense.payer_member_id, meId)} paid · {formatDate(expense.date)} ·{" "}
          {expense.split_type === "equal" ? "Split equally" : "Exact amounts"}
        </p>
      </div>

      <table className="share-table">
        <thead>
          <tr>
            <th scope="col">Person</th>
            <th scope="col" className="num">
              Share
            </th>
          </tr>
        </thead>
        <tbody>
          {shares.map((share) => (
            <tr key={share.id} className={share.member_id === meId ? "is-me" : undefined}>
              <td>
                {memberName(members, share.member_id)}
                {share.member_id === meId && <span className="tag">you</span>}
              </td>
              <td className="num money">{formatMoney(share.amount_cents, currency)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Total</th>
            <td className="num money">{formatMoney(shareTotal, currency)}</td>
          </tr>
        </tfoot>
      </table>

      {roundedEqual && (
        <p className="field-hint">
          This didn't divide evenly, so the leftover cents went one each to the people who were
          added to the group first.
        </p>
      )}
      {!shares.some((s) => s.member_id === expense.payer_member_id) && (
        <p className="field-hint">
          {subject(members, expense.payer_member_id, meId)} paid but{" "}
          {expense.payer_member_id === meId ? "aren't" : "isn't"} part of this split.
        </p>
      )}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="form-actions">
        <ConfirmButton label="Delete expense" onConfirm={remove} disabled={busy} />
        <span className="grow" />
        <button type="button" className="btn btn-primary" onClick={onEdit} disabled={busy}>
          Edit
        </button>
      </div>
    </div>
  );
}

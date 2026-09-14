import { formatMoney } from "../../domain/money";
import { formatDate } from "../../lib/dates";
import { subject } from "../../lib/people";
import type { Expense, GroupSnapshot } from "../../types";

interface ExpenseListProps {
  snapshot: GroupSnapshot;
  meId: string | null;
  onOpen: (expense: Expense) => void;
}

function yourPart(expense: Expense, meId: string | null) {
  if (!meId) return null;
  const myShare = expense.shares.find((s) => s.member_id === meId)?.amount_cents ?? 0;
  if (expense.payer_member_id === meId) {
    const lent = expense.amount_cents - myShare;
    return lent > 0 ? { label: "you lent", cents: lent, tone: "credit" } : null;
  }
  return myShare > 0 ? { label: "you borrowed", cents: myShare, tone: "debt" } : null;
}

export function ExpenseList({ snapshot, meId, onOpen }: ExpenseListProps) {
  const { expenses, members, group } = snapshot;

  if (expenses.length === 0) {
    return (
      <p className="empty muted">
        No expenses yet. Add the first one — who paid, how much, and who it was for.
      </p>
    );
  }

  return (
    <ul className="ledger">
      {expenses.map((expense) => {
        const part = yourPart(expense, meId);
        return (
          <li key={expense.id}>
            <button type="button" className="ledger-row" onClick={() => onOpen(expense)}>
              <span className="ledger-date">{formatDate(expense.date)}</span>
              <span className="ledger-main">
                <span className="ledger-title">{expense.description}</span>
                <span className="ledger-sub">
                  {subject(members, expense.payer_member_id, meId)} paid{" "}
                  {formatMoney(expense.amount_cents, group.currency)}
                  {expense.split_type === "exact" && " · exact amounts"}
                </span>
              </span>
              <span className="ledger-aside">
                {part ? (
                  <>
                    <span className="ledger-aside-label">{part.label}</span>
                    <span className={`money tone-${part.tone}`}>
                      {formatMoney(part.cents, group.currency)}
                    </span>
                  </>
                ) : (
                  <span className="ledger-aside-label">{meId ? "not involved" : ""}</span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

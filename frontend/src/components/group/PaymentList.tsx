import { formatMoney } from "../../domain/money";
import { formatDate } from "../../lib/dates";
import { paidPhrase } from "../../lib/people";
import type { GroupSnapshot, Settlement } from "../../types";

interface PaymentListProps {
  snapshot: GroupSnapshot;
  meId: string | null;
  onOpen: (settlement: Settlement) => void;
}

export function PaymentList({ snapshot, meId, onOpen }: PaymentListProps) {
  const { settlements, members, group } = snapshot;

  if (settlements.length === 0) {
    return <p className="empty muted">No payments recorded yet.</p>;
  }

  return (
    <ul className="ledger">
      {settlements.map((settlement) => (
        <li key={settlement.id}>
          <button type="button" className="ledger-row" onClick={() => onOpen(settlement)}>
            <span className="ledger-date">{formatDate(settlement.date)}</span>
            <span className="ledger-main">
              <span className="ledger-title">
                {paidPhrase(members, settlement.from_member_id, settlement.to_member_id, meId)}
              </span>
              <span className="ledger-sub">Payment · tap to edit</span>
            </span>
            <span className="ledger-aside">
              <span className="money">{formatMoney(settlement.amount_cents, group.currency)}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

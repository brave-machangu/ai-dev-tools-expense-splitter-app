import { useState } from "react";

import { isAllSettled } from "../../domain/calc";
import { formatMoney, formatMoneyAbs } from "../../domain/money";
import { memberName, owesPhrase } from "../../lib/people";
import type { GroupSnapshot, Transfer } from "../../types";

interface BalancesPanelProps {
  snapshot: GroupSnapshot;
  meId: string | null;
  onRecord: (transfer: Transfer) => void;
}

type View = "simplified" | "raw";

/** F6: simplified transfers by default, with a toggle to raw pairwise debts. */
export function BalancesPanel({ snapshot, meId, onRecord }: BalancesPanelProps) {
  const [view, setView] = useState<View>("simplified");
  const { balances, suggested_transfers, pairwise, members, group } = snapshot;
  const currency = group.currency;
  const settled = isAllSettled(balances);
  const largest = Math.max(1, ...balances.map((b) => Math.abs(b.net_cents)));

  return (
    <section className="card" aria-labelledby="balances-title">
      <div className="card-head">
        <h2 id="balances-title" className="section-title">
          Balances
        </h2>
        <div className="segmented segmented-sm" role="group" aria-label="Balance view">
          <button
            type="button"
            aria-pressed={view === "simplified"}
            onClick={() => setView("simplified")}
          >
            Settle up
          </button>
          <button type="button" aria-pressed={view === "raw"} onClick={() => setView("raw")}>
            Who owes whom
          </button>
        </div>
      </div>

      <ul className="net-list">
        {balances.map((balance) => {
          const isMe = balance.member_id === meId;
          const tone = balance.net_cents > 0 ? "credit" : balance.net_cents < 0 ? "debt" : "zero";
          const width = `${Math.round((Math.abs(balance.net_cents) / largest) * 100)}%`;
          return (
            <li key={balance.member_id} className={`net-row ${isMe ? "is-me" : ""}`}>
              <span className="net-name">
                {memberName(members, balance.member_id)}
                {isMe && <span className="tag">you</span>}
              </span>
              <span className="net-bar" aria-hidden="true">
                <span className={`net-bar-fill tone-bg-${tone}`} style={{ width }} />
              </span>
              <span className={`net-amount money tone-${tone}`}>
                {balance.net_cents > 0 && "gets back "}
                {balance.net_cents < 0 && "owes "}
                {balance.net_cents === 0 ? "settled" : formatMoneyAbs(balance.net_cents, currency)}
              </span>
            </li>
          );
        })}
      </ul>

      {settled ? (
        <p className="settled-banner" role="status">
          <strong>All settled up.</strong> Nobody owes anybody anything.
        </p>
      ) : view === "simplified" ? (
        <div className="stack-sm">
          <h3 className="subsection-title">Suggested payments</h3>
          <ul className="transfer-list">
            {suggested_transfers.map((t) => (
              <li key={`${t.from_member_id}-${t.to_member_id}`} className="transfer-row">
                <span className="grow">
                  {owesPhrase(members, t.from_member_id, t.to_member_id, meId)}{" "}
                  <strong className="money">{formatMoney(t.amount_cents, currency)}</strong>
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => onRecord(t)}
                >
                  Record payment
                </button>
              </li>
            ))}
          </ul>
          <p className="explainer">
            These payments are combined to reduce the number of transfers. You may be asked to pay
            someone you never shared an expense with — the totals work out the same.
          </p>
        </div>
      ) : (
        <div className="stack-sm">
          <h3 className="subsection-title">Direct debts, before combining</h3>
          <ul className="transfer-list">
            {pairwise.map((t) => (
              <li key={`${t.from_member_id}-${t.to_member_id}`} className="transfer-row">
                <span className="grow">
                  {owesPhrase(members, t.from_member_id, t.to_member_id, meId)}{" "}
                  <strong className="money">{formatMoney(t.amount_cents, currency)}</strong>
                </span>
              </li>
            ))}
          </ul>
          <p className="explainer">
            Worked out straight from each expense and payment between two people, with no
            simplification.
          </p>
        </div>
      )}
    </section>
  );
}

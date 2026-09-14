import { useState, type FormEvent } from "react";

import { api, errorMessage } from "../../api/client";
import {
  centsToInputValue,
  currencySymbol,
  formatMoney,
  MAX_AMOUNT_CENTS,
  parseAmountToCents,
} from "../../domain/money";
import { todayIso } from "../../lib/dates";
import { paidPhrase } from "../../lib/people";
import type { GroupSnapshot, Settlement, SettlementInput, Transfer } from "../../types";
import { ConfirmButton } from "../ConfirmButton";

interface SettlementFormProps {
  snapshot: GroupSnapshot;
  meId: string | null;
  /** Present when editing an existing payment. */
  settlement?: Settlement;
  /** Suggested transfer to pre-fill a new payment from. */
  prefill?: Transfer;
  onSaved: (snapshot: GroupSnapshot) => void;
  onCancel: () => void;
}

/** F7: record, edit or delete a payment between two members. */
export function SettlementForm({
  snapshot,
  meId,
  settlement,
  prefill,
  onSaved,
  onCancel,
}: SettlementFormProps) {
  const { group, members } = snapshot;
  const currency = group.currency;
  const source = settlement ?? prefill;

  const firstId = (meId && members.some((m) => m.id === meId) ? meId : members[0]?.id) ?? "";
  const otherId = members.find((m) => m.id !== firstId)?.id ?? "";

  const [fromId, setFromId] = useState(source?.from_member_id ?? firstId);
  const [toId, setToId] = useState(source?.to_member_id ?? otherId);
  const [amountText, setAmountText] = useState(
    source ? centsToInputValue(source.amount_cents) : "",
  );
  const [date, setDate] = useState(settlement?.date ?? todayIso());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountCents = parseAmountToCents(amountText);

  const problem: string | null = (() => {
    if (!fromId || !toId) return "Choose who paid and who received it.";
    if (fromId === toId) return "Pick two different people.";
    if (amountCents === null || amountCents <= 0) return "Enter an amount above zero.";
    if (amountCents > MAX_AMOUNT_CENTS) return "Amounts can be at most 1,000,000.00.";
    return null;
  })();

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (problem || amountCents === null) return;
    const input: SettlementInput = {
      from_member_id: fromId,
      to_member_id: toId,
      amount_cents: amountCents,
      date,
    };
    setBusy(true);
    setError(null);
    try {
      onSaved(
        settlement
          ? await api.updateSettlement(group.code, settlement.id, input)
          : await api.createSettlement(group.code, input),
      );
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!settlement) return;
    setBusy(true);
    setError(null);
    try {
      onSaved(await api.deleteSettlement(group.code, settlement.id));
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const memberOptions = members.map((m) => (
    <option key={m.id} value={m.id}>
      {m.id === meId ? `${m.name} (you)` : m.name}
    </option>
  ));

  return (
    <form className="stack" onSubmit={save} noValidate>
      <div className="field-row">
        <label className="field">
          <span className="field-label">Who paid</span>
          <select className="input" value={fromId} onChange={(e) => setFromId(e.target.value)}>
            {memberOptions}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Who received it</span>
          <select className="input" value={toId} onChange={(e) => setToId(e.target.value)}>
            {memberOptions}
          </select>
        </label>
      </div>

      <div className="field-row">
        <label className="field">
          <span className="field-label">Amount</span>
          <span className="input-affix">
            <span className="input-prefix">{currencySymbol(currency).trim()}</span>
            <input
              className="input input-money"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              autoFocus
            />
          </span>
        </label>
        <label className="field">
          <span className="field-label">Date</span>
          <input
            className="input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
      </div>

      {prefill && !settlement && (
        <p className="field-hint">
          Pre-filled from the suggested payment. If a different amount was actually sent, change it
          — paying more than suggested simply flips the balance the other way.
        </p>
      )}

      {!problem && amountCents !== null && (
        <p className="preview-line">
          {paidPhrase(members, fromId, toId, meId)}{" "}
          <strong className="money">{formatMoney(amountCents, currency)}</strong>
        </p>
      )}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="form-actions">
        {settlement ? (
          <ConfirmButton label="Delete payment" onConfirm={remove} disabled={busy} />
        ) : (
          <span className="small muted form-actions-hint">{problem}</span>
        )}
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy || problem !== null}>
          {busy ? "Saving…" : settlement ? "Save changes" : "Record payment"}
        </button>
      </div>
    </form>
  );
}

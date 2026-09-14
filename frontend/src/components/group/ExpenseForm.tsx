import { useState, type FormEvent } from "react";

import { api, errorMessage } from "../../api/client";
import { splitEqual } from "../../domain/calc";
import {
  centsToInputValue,
  currencySymbol,
  formatMoney,
  formatMoneyAbs,
  MAX_AMOUNT_CENTS,
  parseAmountToCents,
} from "../../domain/money";
import { todayIso } from "../../lib/dates";
import type { Expense, ExpenseInput, GroupSnapshot, SplitType } from "../../types";

interface ExpenseFormProps {
  snapshot: GroupSnapshot;
  meId: string | null;
  /** Present when editing an existing expense. */
  expense?: Expense;
  onSaved: (snapshot: GroupSnapshot) => void;
  onCancel: () => void;
}

/** F4/F5: add or edit an expense, split equally or by exact amounts. */
export function ExpenseForm({ snapshot, meId, expense, onSaved, onCancel }: ExpenseFormProps) {
  const { group, members } = snapshot;
  const currency = group.currency;

  const defaultPayer =
    expense?.payer_member_id ??
    (meId && members.some((m) => m.id === meId) ? meId : (members[0]?.id ?? ""));

  const [description, setDescription] = useState(expense?.description ?? "");
  const [amountText, setAmountText] = useState(
    expense ? centsToInputValue(expense.amount_cents) : "",
  );
  const [date, setDate] = useState(expense?.date ?? todayIso());
  const [payerId, setPayerId] = useState(defaultPayer);
  const [splitType, setSplitType] = useState<SplitType>(expense?.split_type ?? "equal");
  const [participantIds, setParticipantIds] = useState<string[]>(
    expense ? expense.shares.map((s) => s.member_id) : members.map((m) => m.id),
  );
  const [exactTexts, setExactTexts] = useState<Record<string, string>>(() =>
    expense?.split_type === "exact"
      ? Object.fromEntries(
          expense.shares.map((s) => [s.member_id, centsToInputValue(s.amount_cents)]),
        )
      : {},
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---- derived values (all integer cents) --------------------------------
  const amountCents = parseAmountToCents(amountText);
  const participants = members.filter((m) => participantIds.includes(m.id)); // position order
  const equalShares =
    amountCents && participants.length > 0 ? splitEqual(amountCents, participants) : [];
  const equalShareFor = (memberId: string) =>
    equalShares.find((s) => s.member_id === memberId)?.amount_cents;

  const exactEntries = participants.map((m) => {
    const text = exactTexts[m.id] ?? "";
    return { member_id: m.id, text, cents: text.trim() === "" ? 0 : parseAmountToCents(text) };
  });
  const exactHasInvalid = exactEntries.some((e) => e.cents === null);
  const exactSum = exactEntries.reduce((sum, e) => sum + (e.cents ?? 0), 0);
  const remaining = (amountCents ?? 0) - exactSum;

  const problem: string | null = (() => {
    if (!description.trim()) return "Add a description.";
    if (amountCents === null || amountCents <= 0) return "Enter an amount above zero.";
    if (amountCents > MAX_AMOUNT_CENTS) return "Amounts can be at most 1,000,000.00.";
    if (!payerId) return "Choose who paid.";
    if (participants.length === 0) return "Pick at least one person to split between.";
    if (splitType === "exact") {
      if (exactHasInvalid) return "Check the per-person amounts.";
      if (remaining > 0) return `${formatMoneyAbs(remaining, currency)} still to assign.`;
      if (remaining < 0) return `${formatMoneyAbs(-remaining, currency)} more than the total.`;
    }
    return null;
  })();

  // ---- actions -------------------------------------------------------------
  const toggleParticipant = (memberId: string) =>
    setParticipantIds((ids) =>
      ids.includes(memberId) ? ids.filter((id) => id !== memberId) : [...ids, memberId],
    );

  const fillFromEqualSplit = () => {
    if (!amountCents || participants.length === 0) return;
    setExactTexts(
      Object.fromEntries(
        splitEqual(amountCents, participants).map((s) => [
          s.member_id,
          centsToInputValue(s.amount_cents),
        ]),
      ),
    );
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (problem || amountCents === null) return;
    const input: ExpenseInput = {
      payer_member_id: payerId,
      amount_cents: amountCents,
      description: description.trim(),
      date,
      split_type: splitType,
      participant_ids: participants.map((m) => m.id),
      ...(splitType === "exact"
        ? {
            exact_shares: exactEntries.map((e) => ({
              member_id: e.member_id,
              amount_cents: e.cents ?? 0,
            })),
          }
        : {}),
    };
    setBusy(true);
    setError(null);
    try {
      const next = expense
        ? await api.updateExpense(group.code, expense.id, input)
        : await api.createExpense(group.code, input);
      onSaved(next);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const hasRoundingRemainder =
    splitType === "equal" &&
    amountCents !== null &&
    participants.length > 1 &&
    amountCents % participants.length !== 0;

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <label className="field">
        <span className="field-label">What was it for?</span>
        <input
          className="input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Tuesday dinner"
          maxLength={120}
          autoFocus
        />
      </label>

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
              aria-invalid={amountText !== "" && amountCents === null}
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

      <label className="field">
        <span className="field-label">Paid by</span>
        <select className="input" value={payerId} onChange={(e) => setPayerId(e.target.value)}>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.id === meId ? `${m.name} (you)` : m.name}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="field">
        <legend className="field-label">How should it be split?</legend>
        <div className="segmented" role="group" aria-label="Split type">
          <button
            type="button"
            aria-pressed={splitType === "equal"}
            onClick={() => setSplitType("equal")}
          >
            Equally
          </button>
          <button
            type="button"
            aria-pressed={splitType === "exact"}
            onClick={() => setSplitType("exact")}
          >
            Exact amounts
          </button>
        </div>
      </fieldset>

      <fieldset className="field">
        <div className="row-between">
          <legend className="field-label">Split between</legend>
          <span className="row gap-xs">
            <button
              type="button"
              className="btn btn-link btn-sm"
              onClick={() => setParticipantIds(members.map((m) => m.id))}
            >
              Everyone
            </button>
            <button
              type="button"
              className="btn btn-link btn-sm"
              onClick={() => setParticipantIds([])}
            >
              No one
            </button>
          </span>
        </div>

        <ul className="participant-list">
          {members.map((m) => {
            const checked = participantIds.includes(m.id);
            const equalShare = equalShareFor(m.id);
            return (
              <li key={m.id} className={`participant ${checked ? "is-checked" : ""}`}>
                <label className="participant-label">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleParticipant(m.id)}
                  />
                  <span>{m.id === meId ? `${m.name} (you)` : m.name}</span>
                </label>
                {splitType === "equal" ? (
                  <span className="money muted">
                    {checked && equalShare !== undefined ? formatMoney(equalShare, currency) : "—"}
                  </span>
                ) : (
                  <span className="input-affix input-affix-sm">
                    <span className="input-prefix">{currencySymbol(currency).trim()}</span>
                    <input
                      className="input input-money input-sm"
                      value={checked ? (exactTexts[m.id] ?? "") : ""}
                      onChange={(e) =>
                        setExactTexts((texts) => ({ ...texts, [m.id]: e.target.value }))
                      }
                      inputMode="decimal"
                      placeholder="0.00"
                      disabled={!checked}
                      aria-label={`Amount for ${m.name}`}
                      aria-invalid={
                        checked && exactEntries.find((x) => x.member_id === m.id)?.cents === null
                      }
                    />
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        {splitType === "equal" && hasRoundingRemainder && (
          <p className="field-hint">
            It doesn't divide evenly, so the extra cents go one each to the people at the top of the
            list.
          </p>
        )}

        {splitType === "exact" && (
          <div className="row-between remainder-bar">
            <span
              className={`remainder ${remaining === 0 && amountCents ? "is-zero" : "is-off"}`}
              role="status"
            >
              {remaining >= 0 ? "Left to assign: " : "Over by: "}
              <strong className="money">{formatMoneyAbs(remaining, currency)}</strong>
            </span>
            <button
              type="button"
              className="btn btn-link btn-sm"
              onClick={fillFromEqualSplit}
              disabled={!amountCents || participants.length === 0}
            >
              Start from an equal split
            </button>
          </div>
        )}
      </fieldset>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="form-actions">
        <span className="small muted form-actions-hint">{problem}</span>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy || problem !== null}>
          {busy ? "Saving…" : expense ? "Save changes" : "Add expense"}
        </button>
      </div>
    </form>
  );
}

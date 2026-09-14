import { useMemo, useState } from "react";
import { toast } from "sonner";

import { LabelledField, Modal, fieldClass } from "./Modal";
import { api } from "@/lib/api";
import { splitEqual } from "@/lib/calc";
import { centsToInputValue, formatMoney, parseAmountToCents } from "@/lib/money";
import {
  ApiError,
  type Expense,
  type GroupSnapshot,
  type Member,
  type SplitType,
} from "@/lib/types";

const today = () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
};

export function ExpenseDialog({
  code,
  members,
  currency,
  expense,
  defaultPayerId,
  onClose,
  onSaved,
}: {
  code: string;
  members: Member[];
  currency: string;
  expense?: Expense;
  defaultPayerId?: string | null;
  onClose: () => void;
  onSaved: (snapshot: GroupSnapshot) => void;
}) {
  const [payerId, setPayerId] = useState(
    expense?.payer_member_id ?? defaultPayerId ?? members[0]?.id ?? "",
  );
  const [amountStr, setAmountStr] = useState(
    expense ? centsToInputValue(expense.amount_cents) : "",
  );
  const [description, setDescription] = useState(expense?.description ?? "");
  const [date, setDate] = useState(expense?.date ?? today());
  const [splitType, setSplitType] = useState<SplitType>(expense?.split_type ?? "equal");
  const [participantIds, setParticipantIds] = useState<string[]>(
    expense ? expense.shares.map((s) => s.member_id) : members.map((m) => m.id),
  );
  const [exactValues, setExactValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const share of expense?.shares ?? []) {
      initial[share.member_id] = centsToInputValue(share.amount_cents);
    }
    return initial;
  });
  const [busy, setBusy] = useState(false);

  const amountCents = parseAmountToCents(amountStr);
  const participants = members.filter((m) => participantIds.includes(m.id));

  const equalPreview = useMemo(() => {
    if (splitType !== "equal" || amountCents === null || participants.length === 0) return [];
    return splitEqual(amountCents, participants);
  }, [splitType, amountCents, participants]);

  const exactTotal = participants.reduce((sum, member) => {
    const cents = parseAmountToCents(exactValues[member.id] ?? "");
    return sum + (cents ?? 0);
  }, 0);
  const exactAllValid = participants.every(
    (member) => parseAmountToCents(exactValues[member.id] ?? "") !== null,
  );
  const remainder = (amountCents ?? 0) - exactTotal;

  const descriptionOk = description.trim().length >= 1 && description.trim().length <= 120;
  const baseOk =
    payerId !== "" && amountCents !== null && amountCents > 0 && descriptionOk && participants.length > 0;
  const canSave =
    baseOk && !busy && (splitType === "equal" || (exactAllValid && remainder === 0));

  function toggleParticipant(id: string) {
    setParticipantIds((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!canSave || amountCents === null) return;
    setBusy(true);
    const input = {
      payer_member_id: payerId,
      amount_cents: amountCents,
      description: description.trim(),
      date,
      split_type: splitType,
      participant_ids: participants.map((m) => m.id),
      exact_shares:
        splitType === "exact"
          ? participants.map((m) => ({
              member_id: m.id,
              amount_cents: parseAmountToCents(exactValues[m.id] ?? "") ?? 0,
            }))
          : undefined,
    };
    try {
      const snapshot = expense
        ? await api.updateExpense(code, expense.id, input)
        : await api.createExpense(code, input);
      onSaved(snapshot);
      toast.success(expense ? "Expense updated" : "Expense added");
      onClose();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not save the expense");
      setBusy(false);
    }
  }

  return (
    <Modal
      title={expense ? "Edit expense" : "Add expense"}
      subtitle={`Amounts in ${currency}`}
      onClose={onClose}
    >
      <form onSubmit={save}>
        <div className="grid grid-cols-2 gap-3">
          <LabelledField label="Who paid" className="col-span-1">
            <select
              value={payerId}
              onChange={(event) => setPayerId(event.target.value)}
              className={fieldClass()}
            >
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </LabelledField>

          <LabelledField label={`Amount (${currency})`} className="col-span-1">
            <input
              value={amountStr}
              onChange={(event) => setAmountStr(event.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className={fieldClass("tnum")}
            />
          </LabelledField>

          <LabelledField label="What for" className="col-span-2">
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={120}
              placeholder="Villa deposit"
              className={fieldClass()}
            />
          </LabelledField>

          <LabelledField label="Date" className="col-span-2 sm:col-span-1">
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className={fieldClass()}
            />
          </LabelledField>

          <LabelledField label="Split" className="col-span-2 sm:col-span-1">
            <div className="flex rounded-lg border border-line bg-paper p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setSplitType("equal")}
                className={`flex-1 rounded-md px-3 py-2 ${splitType === "equal" ? "bg-ink text-paper" : "text-muted-foreground"}`}
              >
                Equally
              </button>
              <button
                type="button"
                onClick={() => setSplitType("exact")}
                className={`flex-1 rounded-md px-3 py-2 ${splitType === "exact" ? "bg-ink text-paper" : "text-muted-foreground"}`}
              >
                Exact amounts
              </button>
            </div>
          </LabelledField>
        </div>

        <p className="text-muted-foreground mt-5 text-xs font-medium">Split between</p>
        <div className="mt-2 divide-y divide-line rounded-lg border border-line bg-paper px-3">
          {members.map((member) => {
            const checked = participantIds.includes(member.id);
            const equalShare = equalPreview.find((s) => s.member_id === member.id);
            return (
              <div key={member.id} className="flex items-center gap-3 py-2.5">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleParticipant(member.id)}
                  className="size-4 accent-brand"
                  aria-label={`Include ${member.name}`}
                />
                <span className="flex-1 truncate text-sm">{member.name}</span>
                {checked && splitType === "equal" ? (
                  <span className="font-ledger text-sm">
                    {equalShare ? formatMoney(equalShare.amount_cents, currency) : "—"}
                  </span>
                ) : null}
                {checked && splitType === "exact" ? (
                  <input
                    value={exactValues[member.id] ?? ""}
                    onChange={(event) =>
                      setExactValues((current) => ({ ...current, [member.id]: event.target.value }))
                    }
                    inputMode="decimal"
                    placeholder="0.00"
                    aria-label={`${member.name} share`}
                    className="tnum w-24 rounded-md border border-line bg-card px-2 py-1.5 text-right text-sm outline-none focus:border-brand"
                  />
                ) : null}
              </div>
            );
          })}
        </div>

        {splitType === "exact" ? (
          <div
            className={`mt-4 flex items-center justify-between rounded-lg px-3 py-2.5 ${
              remainder === 0 && exactAllValid
                ? "bg-brand-soft text-brand"
                : "bg-debt-soft text-debt"
            }`}
          >
            <span className="text-sm">
              {remainder === 0 && exactAllValid ? "Adds up exactly" : "Left to allocate"}
            </span>
            <span className="font-ledger text-lg font-semibold">
              {formatMoney(remainder, currency)}
            </span>
          </div>
        ) : null}

        {participants.length === 0 ? (
          <p className="mt-3 text-xs text-debt">Pick at least one person.</p>
        ) : null}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground flex-1 rounded-lg border border-line px-4 py-3 text-sm font-semibold"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSave}
            className="flex-1 rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Saving…" : "Save expense"}
          </button>
        </div>
        {splitType === "exact" && remainder !== 0 ? (
          <p className="text-muted-foreground mt-2 text-center text-xs">
            Allocate the full total to enable saving.
          </p>
        ) : null}
      </form>
    </Modal>
  );
}

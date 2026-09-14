import { useState } from "react";
import { toast } from "sonner";

import { LabelledField, Modal, fieldClass } from "./Modal";
import { api } from "@/lib/api";
import { centsToInputValue, parseAmountToCents } from "@/lib/money";
import { ApiError, type GroupSnapshot, type Member, type Settlement } from "@/lib/types";

const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

export function SettlementDialog({
  code,
  members,
  currency,
  settlement,
  prefill,
  onClose,
  onSaved,
}: {
  code: string;
  members: Member[];
  currency: string;
  settlement?: Settlement;
  prefill?: { from_member_id: string; to_member_id: string; amount_cents: number };
  onClose: () => void;
  onSaved: (snapshot: GroupSnapshot) => void;
}) {
  const [fromId, setFromId] = useState(
    settlement?.from_member_id ?? prefill?.from_member_id ?? members[0]?.id ?? "",
  );
  const [toId, setToId] = useState(
    settlement?.to_member_id ?? prefill?.to_member_id ?? members[1]?.id ?? "",
  );
  const [amountStr, setAmountStr] = useState(() => {
    if (settlement) return centsToInputValue(settlement.amount_cents);
    if (prefill) return centsToInputValue(prefill.amount_cents);
    return "";
  });
  const [date, setDate] = useState(settlement?.date ?? today());
  const [busy, setBusy] = useState(false);

  const amountCents = parseAmountToCents(amountStr);
  const canSave =
    !busy && fromId !== "" && toId !== "" && fromId !== toId && amountCents !== null && amountCents > 0;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!canSave || amountCents === null) return;
    setBusy(true);
    const input = {
      from_member_id: fromId,
      to_member_id: toId,
      amount_cents: amountCents,
      date,
    };
    try {
      const snapshot = settlement
        ? await api.updateSettlement(code, settlement.id, input)
        : await api.createSettlement(code, input);
      onSaved(snapshot);
      toast.success(settlement ? "Payment updated" : "Payment recorded");
      onClose();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not save the payment");
      setBusy(false);
    }
  }

  return (
    <Modal
      title={settlement ? "Edit payment" : "Record a payment"}
      subtitle="Quits only notes that this happened — it doesn't move money."
      onClose={onClose}
    >
      <form onSubmit={save}>
        <div className="grid grid-cols-2 gap-3">
          <LabelledField label="Paid by">
            <select
              value={fromId}
              onChange={(event) => setFromId(event.target.value)}
              className={fieldClass()}
            >
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </LabelledField>
          <LabelledField label="Paid to">
            <select
              value={toId}
              onChange={(event) => setToId(event.target.value)}
              className={fieldClass()}
            >
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </LabelledField>
          <LabelledField label={`Amount (${currency})`}>
            <input
              value={amountStr}
              onChange={(event) => setAmountStr(event.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className={fieldClass("tnum")}
            />
          </LabelledField>
          <LabelledField label="Date">
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className={fieldClass()}
            />
          </LabelledField>
        </div>

        {fromId === toId ? (
          <p className="mt-3 text-xs text-debt">A payment needs two different people.</p>
        ) : null}
        <p className="text-muted-foreground mt-3 text-xs leading-relaxed">
          Paying more than suggested is fine — the extra simply flips the balance the other way.
        </p>

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
            {busy ? "Saving…" : "Save payment"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

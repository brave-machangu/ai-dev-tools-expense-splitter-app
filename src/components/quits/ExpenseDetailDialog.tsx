import { toast } from "sonner";

import { Modal } from "./Modal";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { ApiError, type Expense, type GroupSnapshot, type Member } from "@/lib/types";

export function ExpenseDetailDialog({
  code,
  expense,
  members,
  currency,
  onClose,
  onEdit,
  onSaved,
}: {
  code: string;
  expense: Expense;
  members: Member[];
  currency: string;
  onClose: () => void;
  onEdit: () => void;
  onSaved: (snapshot: GroupSnapshot) => void;
}) {
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "Someone removed";
  const orderedShares = [...expense.shares].sort((a, b) => {
    const pa = members.find((m) => m.id === a.member_id)?.position ?? 0;
    const pb = members.find((m) => m.id === b.member_id)?.position ?? 0;
    return pa - pb;
  });

  async function remove() {
    try {
      onSaved(await api.deleteExpense(code, expense.id));
      toast.success("Expense deleted");
      onClose();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not delete the expense");
    }
  }

  return (
    <Modal
      title={expense.description}
      subtitle={`${nameOf(expense.payer_member_id)} paid · ${expense.date} · ${
        expense.split_type === "equal" ? "split equally" : "exact amounts"
      }`}
      onClose={onClose}
    >
      <div className="flex items-baseline justify-between border-b border-line pb-4">
        <span className="text-muted text-xs font-medium">Total</span>
        <span className="font-ledger text-3xl font-semibold">
          {formatMoney(expense.amount_cents, currency)}
        </span>
      </div>

      <p className="text-muted mt-4 text-xs font-medium">Charged to</p>
      <div className="mt-2 divide-y divide-line rounded-lg border border-line bg-paper px-3">
        {orderedShares.map((share) => (
          <div key={share.id} className="flex items-center justify-between py-2.5">
            <span className="text-sm">{nameOf(share.member_id)}</span>
            <span className="font-ledger text-sm">{formatMoney(share.amount_cents, currency)}</span>
          </div>
        ))}
      </div>
      <p className="text-muted mt-2 text-xs">
        Odd pennies go to whoever joined the group first, always in the same order.
      </p>

      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={remove}
          className="flex-1 rounded-lg border border-line px-4 py-3 text-sm font-semibold text-debt"
        >
          Delete
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="flex-1 rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-primary-foreground"
        >
          Edit
        </button>
      </div>
    </Modal>
  );
}

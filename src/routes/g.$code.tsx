import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ExpenseDetailDialog } from "@/components/quits/ExpenseDetailDialog";
import { ExpenseDialog } from "@/components/quits/ExpenseDialog";
import { IdentityPicker } from "@/components/quits/IdentityPicker";
import { MembersDialog } from "@/components/quits/MembersDialog";
import { MemberAvatar, QuitsMark } from "@/components/quits/QuitsMark";
import { SettlementDialog } from "@/components/quits/SettlementDialog";
import { useGroupSnapshot } from "@/hooks/useGroupSnapshot";
import { api } from "@/lib/api";
import { clearIdentity, readIdentity, writeIdentity } from "@/lib/identity";
import { formatMoney, formatSignedMoney } from "@/lib/money";
import { ApiError, type Expense, type Settlement, type Transfer } from "@/lib/types";

export const Route = createFileRoute("/g/$code")({
  head: () => ({
    meta: [
      { title: "Your group — Quits" },
      {
        name: "description",
        content:
          "Add expenses, see who owes whom, and record payments. Anyone with this link can join the group.",
      },
      { property: "og:title", content: "Your group — Quits" },
      {
        property: "og:description",
        content: "Add expenses, see who owes whom, and record payments.",
      },
    ],
  }),
  component: GroupPage,
});

type Dialog =
  | { kind: "none" }
  | { kind: "members" }
  | { kind: "expense"; expense?: Expense }
  | { kind: "expense-detail"; expense: Expense }
  | { kind: "settlement"; settlement?: Settlement; prefill?: Transfer };

function GroupPage() {
  const { code } = Route.useParams();
  const { snapshot, status, commit, holdSync, releaseSync } = useGroupSnapshot(code);

  const [meId, setMeId] = useState<string | null>(null);
  const [identityNotice, setIdentityNotice] = useState<string | null>(null);
  const [identityChecked, setIdentityChecked] = useState(false);
  const [view, setView] = useState<"simplified" | "raw">("simplified");
  const [dialog, setDialog] = useState<Dialog>({ kind: "none" });

  // Validate the stored identity against the group's current members (§F3).
  useEffect(() => {
    if (!snapshot) return;
    const stored = readIdentity(code);
    if (stored && snapshot.members.some((m) => m.id === stored)) {
      setMeId(stored);
    } else if (stored) {
      clearIdentity(code);
      setMeId(null);
      setIdentityNotice(
        "The person you were using this group as is no longer in it. Pick who you are.",
      );
    }
    setIdentityChecked(true);
  }, [snapshot, code]);

  // Hold snapshot application while a form is open, so polling can't clobber input.
  useEffect(() => {
    if (dialog.kind === "none") return;
    holdSync();
    return releaseSync;
  }, [dialog.kind, holdSync, releaseSync]);

  const members = snapshot?.members ?? [];
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "Someone removed";
  const me = members.find((m) => m.id === meId) ?? null;
  const label = (id: string) => (id === meId ? "You" : nameOf(id));

  const myNet = snapshot?.balances.find((b) => b.member_id === meId)?.net_cents ?? 0;
  const settledUp = (snapshot?.balances ?? []).every((b) => b.net_cents === 0);
  const transfers = view === "simplified" ? snapshot?.suggested_transfers ?? [] : snapshot?.pairwise ?? [];

  const total = useMemo(
    () => (snapshot?.expenses ?? []).reduce((sum, e) => sum + e.amount_cents, 0),
    [snapshot],
  );

  if (status === "not_found") {
    return (
      <Centered>
        <h1 className="font-ledger text-3xl font-semibold">No group with that link</h1>
        <p className="text-muted-foreground mt-3 text-sm">
          The code <span className="tnum">{code}</span> doesn&apos;t match any group. Check the link
          you were sent, or start a new group.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          Start a group
        </Link>
      </Centered>
    );
  }

  if (status === "error" && !snapshot) {
    return (
      <Centered>
        <h1 className="font-ledger text-2xl font-semibold">This group didn&apos;t load</h1>
        <p className="text-muted-foreground mt-3 text-sm">Check your connection and try again.</p>
      </Centered>
    );
  }

  if (!snapshot) {
    return (
      <Centered>
        <p className="text-muted-foreground text-sm">Loading the group…</p>
      </Centered>
    );
  }

  const currency = snapshot.group.currency;

  async function copyLink() {
    const url = typeof window === "undefined" ? "" : window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied — send it to the group");
    } catch {
      toast.error("Copy failed. Copy the address from the address bar instead.");
    }
  }

  async function removeSettlement(settlement: Settlement) {
    try {
      commit(await api.deleteSettlement(code, settlement.id));
      toast.success("Payment deleted");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not delete the payment");
    }
  }

  const needsIdentity = identityChecked && !me;

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
          <div className="flex items-center gap-3">
            <QuitsMark />
            <div>
              <p className="font-ledger text-xl leading-none font-semibold">{snapshot.group.name}</p>
              <p className="text-muted-foreground mt-1 text-xs">
                {members.length} {members.length === 1 ? "person" : "people"} · {currency}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={copyLink}
              className="flex flex-col items-end rounded-lg px-2 py-1 text-right hover:bg-card"
            >
              <span className="text-muted-foreground text-xs">Copy invite link</span>
              <span className="tnum text-xs tracking-[0.14em]">code · {snapshot.group.code}</span>
            </button>
            <button
              type="button"
              onClick={() => setDialog({ kind: "members" })}
              className="rounded-lg border border-line bg-card px-3 py-2 text-sm font-semibold"
            >
              People
            </button>
            <button
              type="button"
              onClick={() => setDialog({ kind: "expense" })}
              disabled={members.length === 0}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
            >
              Add expense
            </button>
          </div>
        </header>

        {needsIdentity ? (
          <div className="mt-10">
            <IdentityPicker
              members={members}
              notice={identityNotice}
              onPick={(id) => {
                writeIdentity(code, id);
                setMeId(id);
                setIdentityNotice(null);
              }}
              onAddPeople={() => setDialog({ kind: "members" })}
            />
          </div>
        ) : (
          <section className="mt-8 grid grid-cols-12 gap-6">
            <div className="col-span-12 lg:col-span-5">
              <p className="text-brand text-xs font-semibold tracking-[0.18em] uppercase">
                Your balance
              </p>
              <p className="font-ledger mt-3 text-[64px] leading-none font-semibold">
                {formatSignedMoney(myNet, currency)}
              </p>
              <p className="text-muted-foreground mt-3 text-sm">
                {settledUp
                  ? "All settled up. Nobody owes anybody."
                  : myNet < 0
                    ? `You (${me?.name}) owe the group. ${snapshot.suggested_transfers.length} ${
                        snapshot.suggested_transfers.length === 1 ? "payment" : "payments"
                      } clears everyone out.`
                    : myNet > 0
                      ? `The group owes you (${me?.name}).`
                      : `You (${me?.name}) are square, but others aren't yet.`}
              </p>

              <div className="mt-6 rounded-xl border border-line bg-card p-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-ledger text-lg font-semibold">
                    {view === "simplified" ? "Suggested payments" : "Who owes whom"}
                  </h2>
                  <div className="flex rounded-lg border border-line bg-paper p-0.5 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setView("simplified")}
                      className={`rounded-md px-3 py-1.5 ${view === "simplified" ? "bg-ink text-paper" : "text-muted-foreground"}`}
                    >
                      Simplified
                    </button>
                    <button
                      type="button"
                      onClick={() => setView("raw")}
                      className={`rounded-md px-3 py-1.5 ${view === "raw" ? "bg-ink text-paper" : "text-muted-foreground"}`}
                    >
                      Raw
                    </button>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {transfers.length === 0 ? (
                    <p className="text-muted-foreground rounded-lg bg-paper px-4 py-3 text-sm">
                      {settledUp ? "All settled up." : "Nothing to pay yet."}
                    </p>
                  ) : null}
                  {transfers.map((transfer, index) => (
                    <div
                      key={`${transfer.from_member_id}-${transfer.to_member_id}-${index}`}
                      className="flex items-center justify-between gap-3 rounded-lg bg-paper px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {label(transfer.from_member_id)} → {label(transfer.to_member_id)}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {view === "simplified" ? "Combined payment" : "Directly between them"}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-ledger text-lg font-semibold">
                          {formatMoney(transfer.amount_cents, currency)}
                        </span>
                        <button
                          type="button"
                          onClick={() => setDialog({ kind: "settlement", prefill: transfer })}
                          className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                        >
                          Record
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {view === "simplified" ? (
                  <div className="mt-4 flex items-start gap-2 rounded-lg bg-brand-soft p-3">
                    <span className="text-brand mt-0.5 text-sm">i</span>
                    <p className="text-xs leading-relaxed text-ink/70">
                      These payments are combined to reduce the number of transfers. You may be
                      asked to pay someone you never shared an expense with — the totals work out
                      the same.
                    </p>
                  </div>
                ) : (
                  <p className="text-muted-foreground mt-4 text-xs leading-relaxed">
                    Straight from the expenses, with nothing combined. Use this to check the
                    simplified list.
                  </p>
                )}
              </div>
            </div>

            <div className="col-span-12 lg:col-span-7">
              <div className="rounded-xl border border-line bg-card p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-ledger text-lg font-semibold">Expenses</h2>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {snapshot.expenses.length}{" "}
                      {snapshot.expenses.length === 1 ? "entry" : "entries"} ·{" "}
                      {formatMoney(total, currency)} total
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDialog({ kind: "expense" })}
                    className="text-brand rounded-full border border-brand/40 px-3 py-1.5 text-sm font-semibold"
                  >
                    + Add
                  </button>
                </div>

                {snapshot.expenses.length === 0 ? (
                  <p className="text-muted-foreground mt-5 text-sm">
                    No expenses yet. Add the first thing somebody paid for.
                  </p>
                ) : (
                  <div className="mt-5 divide-y divide-line">
                    {snapshot.expenses.map((expense) => {
                      const payer = members.find((m) => m.id === expense.payer_member_id);
                      const myShare = expense.shares.find((s) => s.member_id === meId);
                      return (
                        <button
                          key={expense.id}
                          type="button"
                          onClick={() => setDialog({ kind: "expense-detail", expense })}
                          className="flex w-full items-center gap-4 py-3.5 text-left"
                        >
                          <MemberAvatar
                            name={payer?.name ?? "?"}
                            position={payer?.position ?? 0}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{expense.description}</p>
                            <p className="text-muted-foreground text-xs">
                              {label(expense.payer_member_id)} paid ·{" "}
                              {expense.split_type === "equal"
                                ? `split ${expense.shares.length} ways`
                                : "exact amounts"}{" "}
                              · {expense.date}
                            </p>
                          </div>
                          <div className="text-right">
                            <span className="font-ledger block text-base font-semibold">
                              {formatMoney(expense.amount_cents, currency)}
                            </span>
                            {myShare ? (
                              <span className="text-muted-foreground text-xs">
                                your share {formatMoney(myShare.amount_cents, currency)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-xs">not your share</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="mt-6 rounded-xl border border-line bg-card p-6">
                <h2 className="font-ledger text-lg font-semibold">Everyone&apos;s position</h2>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {members.map((member) => {
                    const net =
                      snapshot.balances.find((b) => b.member_id === member.id)?.net_cents ?? 0;
                    const tone = net < 0 ? "text-debt" : net > 0 ? "text-brand" : "";
                    const badge =
                      net < 0
                        ? "bg-debt-soft text-debt"
                        : net > 0
                          ? "bg-brand-soft text-brand"
                          : "bg-paper text-muted-foreground";
                    return (
                      <div
                        key={member.id}
                        className={`rounded-lg bg-paper p-4 ${member.id === meId ? "ring-1 ring-ink/10" : ""}`}
                      >
                        <p className="flex items-center gap-2 text-sm font-medium">
                          {label(member.id)}
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge}`}
                          >
                            {net < 0 ? "owes" : net > 0 ? "owed" : "square"}
                          </span>
                        </p>
                        <span className={`font-ledger mt-2 block text-3xl font-semibold ${tone}`}>
                          {formatSignedMoney(net, currency)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-6 rounded-xl border border-line bg-card p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-ledger text-lg font-semibold">Payments recorded</h2>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      Money already handed over between people.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDialog({ kind: "settlement" })}
                    disabled={members.length < 2}
                    className="text-brand rounded-full border border-brand/40 px-3 py-1.5 text-sm font-semibold disabled:opacity-40"
                  >
                    + Record
                  </button>
                </div>

                {snapshot.settlements.length === 0 ? (
                  <p className="text-muted-foreground mt-5 text-sm">Nothing recorded yet.</p>
                ) : (
                  <div className="mt-5 divide-y divide-line">
                    {snapshot.settlements.map((settlement) => (
                      <div key={settlement.id} className="flex items-center gap-3 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {label(settlement.from_member_id)} paid{" "}
                            {label(settlement.to_member_id)}
                          </p>
                          <p className="text-muted-foreground text-xs">{settlement.date}</p>
                        </div>
                        <span className="font-ledger text-base font-semibold">
                          {formatMoney(settlement.amount_cents, currency)}
                        </span>
                        <button
                          type="button"
                          onClick={() => setDialog({ kind: "settlement", settlement })}
                          className="text-muted-foreground rounded-md px-2 py-1.5 text-xs font-semibold hover:bg-paper"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeSettlement(settlement)}
                          className="rounded-md px-2 py-1.5 text-xs font-semibold text-debt hover:bg-debt-soft"
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        <footer className="text-muted-foreground mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4 text-xs">
          <p>Integer minor units only · no floats, ever.</p>
          <p>Updates from other people appear within 5 seconds.</p>
        </footer>
      </div>

      {dialog.kind === "members" ? (
        <MembersDialog
          code={code}
          members={members}
          onClose={() => setDialog({ kind: "none" })}
          onSaved={commit}
        />
      ) : null}

      {dialog.kind === "expense" ? (
        <ExpenseDialog
          code={code}
          members={members}
          currency={currency}
          expense={dialog.expense}
          defaultPayerId={meId}
          onClose={() => setDialog({ kind: "none" })}
          onSaved={commit}
        />
      ) : null}

      {dialog.kind === "expense-detail" ? (
        <ExpenseDetailDialog
          code={code}
          expense={
            snapshot.expenses.find((e) => e.id === dialog.expense.id) ?? dialog.expense
          }
          members={members}
          currency={currency}
          onClose={() => setDialog({ kind: "none" })}
          onEdit={() => setDialog({ kind: "expense", expense: dialog.expense })}
          onSaved={commit}
        />
      ) : null}

      {dialog.kind === "settlement" ? (
        <SettlementDialog
          code={code}
          members={members}
          currency={currency}
          settlement={dialog.settlement}
          prefill={dialog.prefill}
          onClose={() => setDialog({ kind: "none" })}
          onSaved={commit}
        />
      ) : null}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-6 text-ink">
      <div className="max-w-md text-center">{children}</div>
    </div>
  );
}

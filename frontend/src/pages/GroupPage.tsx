import { useEffect, useState } from "react";

import { BalancesPanel } from "../components/group/BalancesPanel";
import { ExpenseDetail } from "../components/group/ExpenseDetail";
import { ExpenseForm } from "../components/group/ExpenseForm";
import { ExpenseList } from "../components/group/ExpenseList";
import { IdentityPicker } from "../components/group/IdentityPicker";
import { MembersEditor } from "../components/group/MembersEditor";
import { PaymentList } from "../components/group/PaymentList";
import { SettlementForm } from "../components/group/SettlementForm";
import { Link } from "../components/Link";
import { Modal } from "../components/Modal";
import { formatMoney, formatMoneyAbs } from "../domain/money";
import { useGroupSnapshot } from "../hooks/useGroupSnapshot";
import { clearIdentity, readIdentity, writeIdentity } from "../lib/identity";
import { groupPath } from "../lib/router";
import type { GroupSnapshot, Transfer } from "../types";

type ModalState =
  | { kind: "add-expense" }
  | { kind: "view-expense"; expenseId: string }
  | { kind: "edit-expense"; expenseId: string }
  | { kind: "record-payment"; prefill?: Transfer }
  | { kind: "edit-payment"; settlementId: string }
  | { kind: "members" };

const REMOVED_IDENTITY_NOTICE =
  "The person you were using this group as is no longer in it. Pick who you are.";

export function GroupPage({ code }: { code: string }) {
  const [modal, setModal] = useState<ModalState | null>(null);
  // F9: hold incoming snapshots while a form is open (viewing isn't editing).
  const formOpen = modal !== null && modal.kind !== "view-expense";
  const { snapshot, status, lastSyncFailed, loadError, refresh, commit } = useGroupSnapshot(
    code,
    formOpen,
  );

  const [meId, setMeId] = useState<string | null>(() => readIdentity(code));
  const [identityNotice, setIdentityNotice] = useState<string | null>(null);
  // Spec §8.1: the organiser adds every name first, then picks who they are. A
  // group seen with no members starts in setup, and stays there until "Done".
  const [addingPeople, setAddingPeople] = useState(false);

  useEffect(() => {
    if (snapshot && snapshot.members.length === 0) setAddingPeople(true);
  }, [snapshot]);

  // F3: the stored identity must still be a member of the group.
  useEffect(() => {
    if (!snapshot || !meId) return;
    if (!snapshot.members.some((m) => m.id === meId)) {
      clearIdentity(code);
      setMeId(null);
      setIdentityNotice(REMOVED_IDENTITY_NOTICE);
    }
  }, [snapshot, meId, code]);

  // Close a detail view whose expense was deleted elsewhere.
  useEffect(() => {
    if (modal?.kind === "view-expense" && snapshot) {
      if (!snapshot.expenses.some((e) => e.id === modal.expenseId)) setModal(null);
    }
  }, [modal, snapshot]);

  useEffect(() => {
    document.title = snapshot ? `${snapshot.group.name} · ProRata` : "ProRata";
  }, [snapshot]);

  if (status === "loading") {
    return (
      <section className="card empty-state" aria-busy="true">
        <span className="spinner" aria-hidden="true" />
        <p className="muted">Loading group…</p>
      </section>
    );
  }

  if (status === "not_found") {
    return (
      <section className="card empty-state">
        <h1 className="section-title">We couldn't find that group</h1>
        <p className="muted">
          There's no group with the code <code className="code-pill">{code}</code>. Check the link
          you were sent.
        </p>
        <Link to="/" className="btn btn-primary">
          Start a new group
        </Link>
      </section>
    );
  }

  if (status === "error" || !snapshot) {
    return (
      <section className="card empty-state">
        <h1 className="section-title">Couldn't load this group</h1>
        <p className="muted" role="alert">
          {loadError ?? "Something went wrong reaching the server."}
        </p>
        <button type="button" className="btn btn-primary" onClick={() => void refresh()}>
          Try again
        </button>
      </section>
    );
  }

  const { group, members, expenses, balances } = snapshot;
  const me = meId ? members.find((m) => m.id === meId) : undefined;

  const pickIdentity = (memberId: string) => {
    writeIdentity(code, memberId);
    setMeId(memberId);
    setIdentityNotice(null);
  };

  const saved = (next: GroupSnapshot) => {
    commit(next);
    setModal(null);
  };

  const header = <GroupHeader snapshot={snapshot} lastSyncFailed={lastSyncFailed} />;

  // --- Setup: add everyone, then continue -----------------------------------
  if (!me && (members.length === 0 || addingPeople)) {
    return (
      <div className="stack-lg">
        {header}
        <section className="card" aria-labelledby="setup-title">
          <p className="eyebrow">Step 1 of 2</p>
          <h2 id="setup-title" className="section-title">
            Who's in this group?
          </h2>
          <p className="muted">
            Add everyone's name (up to 8), including your own. When everyone's in, pick who you are.
          </p>
          <MembersEditor snapshot={snapshot} meId={null} onSaved={commit} />
          <div className="row-between setup-actions">
            <span className="small muted">
              {members.length === 0
                ? "Add at least one name to continue."
                : `${members.length} ${members.length === 1 ? "person" : "people"} added.`}
            </span>
            <button
              type="button"
              className="btn btn-primary"
              disabled={members.length === 0}
              onClick={() => setAddingPeople(false)}
            >
              Done — pick who you are
            </button>
          </div>
        </section>
      </div>
    );
  }

  // --- Identity -------------------------------------------------------------
  if (!me) {
    return (
      <div className="stack-lg">
        {header}
        <IdentityPicker
          groupName={group.name}
          members={members}
          notice={identityNotice}
          onPick={pickIdentity}
        />
        <section className="card" aria-labelledby="missing-title">
          <h2 id="missing-title" className="section-title">
            Missing someone, or a name typed wrong?
          </h2>
          <MembersEditor snapshot={snapshot} meId={null} onSaved={commit} />
        </section>
      </div>
    );
  }

  // --- Main view ------------------------------------------------------------
  const myNet = balances.find((b) => b.member_id === me.id)?.net_cents ?? 0;
  const totalSpent = expenses.reduce((sum, e) => sum + e.amount_cents, 0);

  const viewingExpense =
    modal?.kind === "view-expense" || modal?.kind === "edit-expense"
      ? expenses.find((e) => e.id === modal.expenseId)
      : undefined;
  const editingSettlement =
    modal?.kind === "edit-payment"
      ? snapshot.settlements.find((s) => s.id === modal.settlementId)
      : undefined;

  return (
    <div className="stack-lg">
      {header}

      <section className="card headline-card" aria-live="polite">
        <div className="headline">
          <p className="eyebrow">
            Hi {me.name} ·{" "}
            <button
              type="button"
              className="btn btn-link btn-inline"
              onClick={() => {
                clearIdentity(code);
                setMeId(null);
              }}
            >
              not you?
            </button>
          </p>
          {myNet === 0 ? (
            <p className="headline-text">You're all square.</p>
          ) : (
            <p className="headline-text">
              {myNet > 0 ? "You're owed " : "You owe "}
              <span className={`money tone-${myNet > 0 ? "credit" : "debt"}`}>
                {formatMoneyAbs(myNet, group.currency)}
              </span>
            </p>
          )}
          <p className="small muted">
            {expenses.length} {expenses.length === 1 ? "expense" : "expenses"} ·{" "}
            {formatMoney(totalSpent, group.currency)} spent in total
          </p>
        </div>
        <div className="headline-actions">
          <button
            type="button"
            className="btn btn-primary btn-lg"
            onClick={() => setModal({ kind: "add-expense" })}
          >
            + Add expense
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setModal({ kind: "record-payment" })}
            disabled={members.length < 2}
          >
            Record a payment
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setModal({ kind: "members" })}
          >
            People ({members.length})
          </button>
        </div>
      </section>

      <div className="group-grid">
        <div className="stack-lg">
          <section className="card" aria-labelledby="expenses-title">
            <div className="card-head">
              <h2 id="expenses-title" className="section-title">
                Expenses
              </h2>
            </div>
            <ExpenseList
              snapshot={snapshot}
              meId={me.id}
              onOpen={(expense) => setModal({ kind: "view-expense", expenseId: expense.id })}
            />
          </section>

          <section className="card" aria-labelledby="payments-title">
            <div className="card-head">
              <h2 id="payments-title" className="section-title">
                Payments
              </h2>
            </div>
            <PaymentList
              snapshot={snapshot}
              meId={me.id}
              onOpen={(settlement) =>
                setModal({ kind: "edit-payment", settlementId: settlement.id })
              }
            />
          </section>
        </div>

        <BalancesPanel
          snapshot={snapshot}
          meId={me.id}
          onRecord={(transfer) => setModal({ kind: "record-payment", prefill: transfer })}
        />
      </div>

      {modal?.kind === "add-expense" && (
        <Modal title="Add an expense" onClose={() => setModal(null)}>
          <ExpenseForm
            snapshot={snapshot}
            meId={me.id}
            onSaved={saved}
            onCancel={() => setModal(null)}
          />
        </Modal>
      )}

      {modal?.kind === "view-expense" && viewingExpense && (
        <Modal title={viewingExpense.description} onClose={() => setModal(null)}>
          <ExpenseDetail
            snapshot={snapshot}
            meId={me.id}
            expense={viewingExpense}
            onEdit={() => setModal({ kind: "edit-expense", expenseId: viewingExpense.id })}
            onDeleted={saved}
          />
        </Modal>
      )}

      {modal?.kind === "edit-expense" && viewingExpense && (
        <Modal title="Edit expense" onClose={() => setModal(null)}>
          <ExpenseForm
            snapshot={snapshot}
            meId={me.id}
            expense={viewingExpense}
            onSaved={saved}
            onCancel={() => setModal({ kind: "view-expense", expenseId: viewingExpense.id })}
          />
        </Modal>
      )}

      {modal?.kind === "record-payment" && (
        <Modal title="Record a payment" onClose={() => setModal(null)}>
          <SettlementForm
            snapshot={snapshot}
            meId={me.id}
            {...(modal.prefill ? { prefill: modal.prefill } : {})}
            onSaved={saved}
            onCancel={() => setModal(null)}
          />
        </Modal>
      )}

      {modal?.kind === "edit-payment" && editingSettlement && (
        <Modal title="Edit payment" onClose={() => setModal(null)}>
          <SettlementForm
            snapshot={snapshot}
            meId={me.id}
            settlement={editingSettlement}
            onSaved={saved}
            onCancel={() => setModal(null)}
          />
        </Modal>
      )}

      {modal?.kind === "members" && (
        <Modal title="People in this group" onClose={() => setModal(null)}>
          <MembersEditor snapshot={snapshot} meId={me.id} onSaved={commit} />
        </Modal>
      )}
    </div>
  );
}

function GroupHeader({
  snapshot,
  lastSyncFailed,
}: {
  snapshot: GroupSnapshot;
  lastSyncFailed: boolean;
}) {
  const { group, members } = snapshot;
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}${groupPath(group.code)}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the link stays visible (and in the tooltip) to copy by hand.
    }
  };

  return (
    <header className="group-header">
      <div>
        <p className="eyebrow">
          {group.currency} · {members.length} {members.length === 1 ? "person" : "people"}
        </p>
        <h1 className="page-title">{group.name}</h1>
        <p className={`sync-status ${lastSyncFailed ? "is-offline" : ""}`} role="status">
          <span className="sync-dot" aria-hidden="true" />
          {lastSyncFailed ? "Can't reach the server — retrying" : "Live · updates every 5 seconds"}
        </p>
      </div>
      <div className="share-box">
        <span className="small muted">Share this link</span>
        <span className="row row-nowrap">
          <code className="code-pill" title={link}>
            /g/{group.code}
          </code>
          <button type="button" className="btn btn-secondary btn-sm" onClick={copyLink}>
            {copied ? "Copied!" : "Copy link"}
          </button>
        </span>
      </div>
    </header>
  );
}

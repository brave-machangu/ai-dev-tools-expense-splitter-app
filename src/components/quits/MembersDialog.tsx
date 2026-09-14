import { useState } from "react";
import { toast } from "sonner";

import { Modal, fieldClass } from "./Modal";
import { MemberAvatar } from "./QuitsMark";
import { api } from "@/lib/api";
import { ApiError, type GroupSnapshot, type Member } from "@/lib/types";

export function MembersDialog({
  code,
  members,
  onClose,
  onSaved,
}: {
  code: string;
  members: Member[];
  onClose: () => void;
  onSaved: (snapshot: GroupSnapshot) => void;
}) {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<GroupSnapshot>) {
    setBusy(true);
    try {
      onSaved(await action());
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function add(event: React.FormEvent) {
    event.preventDefault();
    const name = newName.trim();
    if (name.length < 1) return;
    await run(() => api.addMember(code, name));
    setNewName("");
  }

  return (
    <Modal title="People" subtitle="Up to 8 people per group" onClose={onClose}>
      <div className="divide-y divide-line rounded-lg border border-line bg-paper px-3">
        {members.length === 0 ? (
          <p className="text-muted-foreground py-4 text-sm">Nobody yet — add the first name below.</p>
        ) : null}
        {members.map((member) => (
          <div key={member.id} className="flex items-center gap-3 py-2.5">
            <MemberAvatar name={member.name} position={member.position} />
            {editingId === member.id ? (
              <>
                <input
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  maxLength={40}
                  className="flex-1 rounded-md border border-line bg-card px-2 py-1.5 text-sm outline-none focus:border-brand"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    await run(() => api.renameMember(code, member.id, editName));
                    setEditingId(null);
                  }}
                  className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                >
                  Save
                </button>
              </>
            ) : (
              <>
                <span className="flex-1 truncate text-sm font-medium">{member.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(member.id);
                    setEditName(member.name);
                  }}
                  className="text-muted-foreground rounded-md px-2 py-1.5 text-xs font-semibold hover:bg-card"
                >
                  Rename
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(() => api.deleteMember(code, member.id))}
                  className="rounded-md px-2 py-1.5 text-xs font-semibold text-debt hover:bg-debt-soft"
                >
                  Remove
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={add} className="mt-4 flex gap-2">
        <input
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          maxLength={40}
          placeholder="Add a name"
          className={fieldClass("flex-1")}
        />
        <button
          type="submit"
          disabled={busy || members.length >= 8 || newName.trim() === ""}
          className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-40"
        >
          Add
        </button>
      </form>
      <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
        Someone added now isn&apos;t added to expenses that already exist. People who appear in an
        expense or payment can be renamed but not removed.
      </p>
    </Modal>
  );
}

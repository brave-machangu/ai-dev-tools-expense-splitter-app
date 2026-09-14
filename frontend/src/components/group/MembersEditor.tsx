import { useState, type FormEvent } from "react";

import { api, errorMessage } from "../../api/client";
import { initials } from "../../lib/people";
import type { GroupSnapshot } from "../../types";
import { ConfirmButton } from "../ConfirmButton";

const MAX_MEMBERS = 8;

interface MembersEditorProps {
  snapshot: GroupSnapshot;
  meId: string | null;
  onSaved: (snapshot: GroupSnapshot) => void;
}

/** F2: add (up to 8), rename, and delete members that nothing references. */
export function MembersEditor({ snapshot, meId, onSaved }: MembersEditorProps) {
  const { group, members } = snapshot;
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const full = members.length >= MAX_MEMBERS;

  const run = async (action: () => Promise<GroupSnapshot>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      onSaved(await action());
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const addMember = async (event: FormEvent) => {
    event.preventDefault();
    if (await run(() => api.addMember(group.code, newName))) setNewName("");
  };

  const saveRename = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingId) return;
    const id = editingId;
    if (await run(() => api.renameMember(group.code, id, draft))) setEditingId(null);
  };

  return (
    <div className="stack">
      {members.length > 0 && (
        <ul className="member-list">
          {members.map((member) => (
            <li key={member.id} className="member-row">
              <span className="avatar avatar-sm" aria-hidden="true">
                {initials(member.name)}
              </span>
              {editingId === member.id ? (
                <form className="row row-nowrap grow" onSubmit={saveRename}>
                  <input
                    className="input input-sm grow"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    maxLength={40}
                    aria-label={`New name for ${member.name}`}
                    autoFocus
                  />
                  <button className="btn btn-primary btn-sm" type="submit" disabled={busy}>
                    Save
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    type="button"
                    onClick={() => setEditingId(null)}
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <>
                  <span className="grow member-name">
                    {member.name}
                    {member.id === meId && <span className="tag">you</span>}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busy}
                    onClick={() => {
                      setEditingId(member.id);
                      setDraft(member.name);
                      setError(null);
                    }}
                  >
                    Rename
                  </button>
                  <ConfirmButton
                    label="Remove"
                    confirmLabel="Remove"
                    className="btn btn-danger-ghost btn-sm"
                    disabled={busy}
                    onConfirm={() => void run(() => api.deleteMember(group.code, member.id))}
                  />
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <form className="stack-sm" onSubmit={addMember}>
        <label className="field">
          <span className="field-label">
            Add a person{" "}
            <span className="muted">
              ({members.length} of {MAX_MEMBERS})
            </span>
          </span>
          <span className="row row-nowrap">
            <input
              className="input grow"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={full ? "This group is full" : "Name"}
              maxLength={40}
              disabled={full}
            />
            <button
              className="btn btn-secondary"
              type="submit"
              disabled={busy || full || !newName.trim()}
            >
              Add
            </button>
          </span>
        </label>
        <p className="field-hint">
          People added now aren't included in expenses that already exist. Someone can only be
          removed if they're not part of any expense or payment.
        </p>
      </form>
    </div>
  );
}

import { MemberAvatar } from "./QuitsMark";
import type { Member } from "@/lib/types";

export function IdentityPicker({
  members,
  notice,
  onPick,
  onAddPeople,
}: {
  members: Member[];
  notice?: string | null;
  onPick: (memberId: string) => void;
  onAddPeople: () => void;
}) {
  return (
    <div className="mx-auto max-w-lg rounded-xl border border-line bg-card p-6">
      <h2 className="font-ledger text-lg font-semibold">Who are you?</h2>
      <p className="text-muted-foreground mt-1 text-xs">
        Pick your name. This browser remembers it, so you only do this once.
      </p>
      {notice ? (
        <p className="mt-4 rounded-lg bg-debt-soft p-3 text-xs leading-relaxed text-debt">{notice}</p>
      ) : null}

      {members.length === 0 ? (
        <div className="mt-5">
          <p className="text-muted-foreground text-sm">Nobody has been added to this group yet.</p>
          <button
            type="button"
            onClick={onAddPeople}
            className="mt-3 w-full rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-primary-foreground"
          >
            Add people
          </button>
        </div>
      ) : (
        <div className="mt-5 space-y-2">
          {members.map((member) => (
            <button
              key={member.id}
              type="button"
              onClick={() => onPick(member.id)}
              className="flex w-full items-center gap-3 rounded-lg bg-paper px-4 py-3 text-left transition-colors hover:border-brand"
            >
              <MemberAvatar name={member.name} position={member.position} />
              <span className="text-sm font-medium">{member.name}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={onAddPeople}
            className="text-muted-foreground w-full rounded-lg border border-line px-4 py-2.5 text-xs font-semibold"
          >
            I&apos;m not on this list — add people
          </button>
        </div>
      )}
    </div>
  );
}

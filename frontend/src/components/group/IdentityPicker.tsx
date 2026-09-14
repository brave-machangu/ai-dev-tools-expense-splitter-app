import { initials } from "../../lib/people";
import type { Member } from "../../types";

interface IdentityPickerProps {
  groupName: string;
  members: Member[];
  notice?: string | null;
  onPick: (memberId: string) => void;
}

/** F3: pick which member you are. The choice is remembered per group. */
export function IdentityPicker({ groupName, members, notice, onPick }: IdentityPickerProps) {
  return (
    <section className="card identity-card" aria-labelledby="identity-title">
      <p className="eyebrow">{groupName}</p>
      <h2 id="identity-title" className="section-title">
        Who are you?
      </h2>
      <p className="muted">Pick your name so amounts read as “you owe” and “owes you”.</p>
      {notice && (
        <p className="notice" role="alert">
          {notice}
        </p>
      )}
      <ul className="identity-grid">
        {members.map((member) => (
          <li key={member.id}>
            <button type="button" className="identity-option" onClick={() => onPick(member.id)}>
              <span className="avatar" aria-hidden="true">
                {initials(member.name)}
              </span>
              <span className="identity-name">{member.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Copy helpers. Once identity is known, everything is second-person (F3):
 * "You owe Ana €14.50", "Sam owes you €3.00".
 */
import type { Member } from "../types";

export function memberName(members: Member[], id: string): string {
  return members.find((m) => m.id === id)?.name ?? "Someone";
}

/** Subject form: "You" or the member's name. */
export function subject(members: Member[], id: string, meId: string | null): string {
  return id === meId ? "You" : memberName(members, id);
}

/** Object form: "you" or the member's name. */
export function object(members: Member[], id: string, meId: string | null): string {
  return id === meId ? "you" : memberName(members, id);
}

/** "You owe Ana" / "Sam owes you" / "Sam owes Ana" */
export function owesPhrase(
  members: Member[],
  fromId: string,
  toId: string,
  meId: string | null,
): string {
  const verb = fromId === meId ? "owe" : "owes";
  return `${subject(members, fromId, meId)} ${verb} ${object(members, toId, meId)}`;
}

/** "You paid Ana" / "Sam paid you" */
export function paidPhrase(
  members: Member[],
  fromId: string,
  toId: string,
  meId: string | null,
): string {
  return `${subject(members, fromId, meId)} paid ${object(members, toId, meId)}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : [name.trim()];
  return letters
    .map((part) => part?.charAt(0) ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

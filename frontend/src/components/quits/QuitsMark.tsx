export function QuitsMark() {
  return (
    <div className="grid size-10 place-items-center rounded-lg bg-brand text-primary-foreground">
      <span className="font-ledger text-lg font-semibold">Q</span>
    </div>
  );
}

const AVATAR_TONES = [
  "bg-brand-soft text-brand",
  "bg-debt-soft text-debt",
  "bg-accent/15 text-accent",
  "bg-brand/15 text-brand",
] as const;

export function MemberAvatar({ name, position }: { name: string; position: number }) {
  const tone = AVATAR_TONES[position % AVATAR_TONES.length];
  return (
    <div
      className={`grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold ${tone}`}
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </div>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Today's date in the user's timezone, as "YYYY-MM-DD". */
export function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** "2026-09-12" → "12 Sep" (or "12 Sep 2025" outside the current year). */
export function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(y === new Date().getFullYear() ? {} : { year: "numeric" }),
  });
}

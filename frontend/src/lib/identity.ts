/**
 * localStorage holds exactly one thing per group: the chosen member id.
 * Every read and write is guarded — private browsing can throw, and the app
 * must still render (it just asks who you are on every load).
 */
const keyFor = (code: string) => `quits.identity.${code.toUpperCase()}`;

export function readIdentity(code: string): string | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(keyFor(code));
  } catch {
    return null;
  }
}

export function writeIdentity(code: string, memberId: string): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(keyFor(code), memberId);
  } catch {
    /* ignore — identity simply won't persist */
  }
}

export function clearIdentity(code: string): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(keyFor(code));
  } catch {
    /* ignore */
  }
}

/**
 * F3 identity: localStorage holds the chosen member id per group code.
 * Every access is guarded — private browsing or blocked site data can make
 * localStorage throw, and the app must still work (it just asks every time).
 */
const keyFor = (code: string) => `prorata.identity.${code.toUpperCase()}`;

export function readIdentity(code: string): string | null {
  try {
    return window.localStorage.getItem(keyFor(code));
  } catch {
    return null;
  }
}

export function writeIdentity(code: string, memberId: string): void {
  try {
    window.localStorage.setItem(keyFor(code), memberId);
  } catch {
    // Identity simply won't persist across visits.
  }
}

export function clearIdentity(code: string): void {
  try {
    window.localStorage.removeItem(keyFor(code));
  } catch {
    // Nothing to clear.
  }
}

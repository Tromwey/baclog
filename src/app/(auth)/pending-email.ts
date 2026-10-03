/**
 * The address a code was just sent to, carried from /login to /verify.
 *
 * It used to ride the URL (`/verify?email=…`), which put a personal datum in
 * the browser history, in any `Referer` the page emits and in every access
 * log between here and the origin. `sessionStorage` keeps it to this tab and
 * drops it when the tab closes.
 *
 * Storage can throw or come back empty (private mode, blocked site data): all
 * three calls swallow that, and /verify then simply asks for the address
 * again — a degraded path, never a dead end.
 *
 * Plain module (no "use client"): browser-only by guard, importable anywhere.
 */

const KEY = "kura:pending-email";

export function stashPendingEmail(email: string): void {
  try {
    window.sessionStorage.setItem(KEY, email.trim());
  } catch {
    // /verify asks for it again
  }
}

export function readPendingEmail(): string {
  try {
    return window.sessionStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function clearPendingEmail(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}

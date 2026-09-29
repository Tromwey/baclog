import { safeReturnTo } from "@/lib/return-to";

/**
 * The `?to=` of the page the browser is on, when it's an allowed return
 * (colecciones de fiesta, contract §3: only `/f/{token}` and `/c/{uuid}` —
 * `safeReturnTo`). Read from `window.location` at the moment of the action,
 * so /login needs no `useSearchParams` (and no Suspense boundary). Client-only.
 */
export function returnToParam(): string | null {
  if (typeof window === "undefined") return null;
  return safeReturnTo(new URLSearchParams(window.location.search).get("to"));
}

/** `path` with the current `?to=` carried along (/login → /verify). */
export function carryReturnTo(path: string): string {
  const to = returnToParam();
  if (!to) return path;
  return `${path}${path.includes("?") ? "&" : "?"}to=${encodeURIComponent(to)}`;
}

/**
 * The handoff's landing allow-list (src/authz/handoff.ts) — pure, no
 * server-only imports, so it can be exercised without a server or a DB.
 * Used by BOTH ends: `POST /api/v1/auth/web-session` (400 on a bad `to`) and
 * `GET /api/auth/handoff` (a bad `to` lands on /login and never touches the
 * token).
 */

/** Where a handoff may land. Exact paths; `?mes=YYYY-MM` on both (both
 *  pages read it). Anything else — absolute URLs, `//host`, backslashes,
 *  other paths or params — is refused, never "cleaned up". Kept to what the
 *  app actually opens (phase 4b removed `/`: unused, and every extra landing
 *  widens what a planted handoff can do). */
export const HANDOFF_PATHS: readonly string[] = ["/recap/tarjeta", "/recap"];
const PATHS_WITH_MONTH = new Set(["/recap/tarjeta", "/recap"]);
export const DEFAULT_HANDOFF_TARGET = "/recap/tarjeta";
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const PROBE_ORIGIN = "http://handoff.invalid";

/** Canonical allow-listed target, or null. Pure — used by both ends. */
export function parseHandoffTarget(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 200) return null;
  if (raw[0] !== "/" || raw[1] === "/" || raw[1] === "\\") return null;
  // No backslashes, whitespace or control characters anywhere: browsers
  // normalise `\` to `/`, and a stray CR/LF has no business in a Location.
  if (/[\\\s\u0000-\u001f\u007f]/.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw, PROBE_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== PROBE_ORIGIN || url.hash !== "") return null;
  if (!HANDOFF_PATHS.includes(url.pathname)) return null;
  const keys = [...url.searchParams.keys()];
  if (keys.length === 0) return url.pathname;
  if (!PATHS_WITH_MONTH.has(url.pathname)) return null;
  if (keys.length !== 1 || keys[0] !== "mes") return null;
  const mes = url.searchParams.get("mes") ?? "";
  if (!MONTH_RE.test(mes)) return null;
  return `${url.pathname}?mes=${mes}`;
}


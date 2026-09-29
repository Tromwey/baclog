/**
 * "Volver a donde estabas" after login/onboarding — the ONLY destinations a
 * `?to=` may carry (colecciones de fiesta, 2026-09-29). A closed list, not a
 * "same-origin path" check: an open redirect on the login page is a phishing
 * primitive, and only the party flow needs a return today.
 *
 *   /f/{token}      — the invite landing (token: 16 chars base64url, the
 *                     shape `newInviteToken` mints — `INVITE_TOKEN_RE` in
 *                     modules/party-collections/rules.ts; the guardrail
 *                     `scripts/check-party-rules.ts` asserts they agree)
 *   /c/{backlogId}  — the party's member page (UUID)
 *
 * Anything else → null, and the caller falls back to its default
 * (`/backlogs`). Pure and client-safe (login/verify/onboarding are client
 * components).
 */

const INVITE_PATH_RE = /^\/f\/[A-Za-z0-9_-]{16}$/;
const PARTY_PATH_RE = /^\/c\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function safeReturnTo(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  // Exact match on the whole string: no query, no fragment, no `//host`, no
  // backslashes, no encoded tricks (the regexes admit none of those chars).
  if (INVITE_PATH_RE.test(raw) || PARTY_PATH_RE.test(raw)) return raw;
  return null;
}

/** `/login?to=…` for a destination that passes `safeReturnTo`, else `/login`. */
export function loginPathFor(to: string): string {
  const safe = safeReturnTo(to);
  return safe ? `/login?to=${encodeURIComponent(safe)}` : "/login";
}

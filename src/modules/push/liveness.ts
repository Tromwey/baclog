import { MOBILE_TOKEN_TTL_SECONDS } from "@/authz/token-ttl";

/**
 * Is the install behind a `device_token` still signed in? Only then may it
 * receive the account's pushes. Pure (no DB, no `server-only`): `pushToUsers`
 * filters with it and the unit test pins it.
 *
 * Why this is needed: logout and session revocation DELETE the tokens, but a
 * bearer that simply EXPIRES (30 days, `MOBILE_TOKEN_TTL_SECONDS`) touches
 * nothing — without this gate a signed-out iPhone kept getting the previous
 * account's pushes forever.
 *
 * The rule, per row (`device_token` LEFT JOIN `mobile_session` on
 * `session_id` AND the same `user_id`):
 *   - bound to a session → the session row exists, is not revoked, and its
 *     `last_seen_at` is within the bearer lifetime. Every bearer of a session
 *     is minted by a request (sign-in or `auth/refresh`) that also stamps
 *     `last_seen_at` (at most ~10 min stale, `touchMobileSession`), so no
 *     bearer of a session unseen for 30 days can still be valid. The bound is
 *     strict on purpose: at worst an install nobody opened in 30 days misses
 *     the last ≤ 10 min of its bearer — never the other way round.
 *   - no session (`session_id` null: registered by a pre-4d, `sid`-less
 *     bearer) → `updated_at` within the bearer lifetime: that bearer was
 *     minted BEFORE the PUT that stamped `updated_at`, so it expires within
 *     30 days of it. The app re-PUTs its token on every launch, which also
 *     re-binds the row to its current `sid`.
 *
 * `pruneStaleDeviceTokens` (`devices.ts`, daily cron) deletes exactly the
 * complement, with the same window.
 */

export const DEVICE_TOKEN_LIVE_WINDOW_MS = MOBILE_TOKEN_TTL_SECONDS * 1000;

export interface DeviceTokenLiveness {
  /** `device_token.session_id`. */
  sessionId: string | null;
  /** The joined `mobile_session.id` — null when the row did not join
   *  (session gone, or of another account). */
  joinedSessionId: string | null;
  sessionRevokedAt: Date | null;
  sessionLastSeenAt: Date | null;
  /** `device_token.updated_at` (bumped by every PUT). */
  updatedAt: Date;
}

export function deviceTokenIsLive(row: DeviceTokenLiveness, now: number = Date.now()): boolean {
  const cutoff = now - DEVICE_TOKEN_LIVE_WINDOW_MS;
  if (row.sessionId === null) return row.updatedAt.getTime() > cutoff;
  if (row.joinedSessionId === null || row.sessionRevokedAt !== null) return false;
  return row.sessionLastSeenAt !== null && row.sessionLastSeenAt.getTime() > cutoff;
}

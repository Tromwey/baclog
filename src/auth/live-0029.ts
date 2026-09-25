/**
 * Phase 4d/4e kill-switch for migration 0029 (`mobile_session`,
 * `device_token`, `follow_push_notice`, `users.notify_followers`).
 *
 * FALSE until the founder applies `drizzle/0029_device_sessions_push.sql` to
 * the shared Neon DB (local = beta = prod). While false the code behaves as
 * before 4d, so it is safe to deploy — and the shared `next dev` keeps
 * working — without the tables:
 *   - sign-ins (OTP, Apple, Google) and `auth/refresh` mint bearers WITHOUT
 *     `sid` (no session row), and the bearer gate ignores any `sid` it sees;
 *   - `GET /me/sessions`, `DELETE /me/sessions/{id}`,
 *     `PUT|DELETE /me/devices/{token}` and `PATCH /me { notifyFollowers }`
 *     answer 503 `unavailable`;
 *   - `Me.notifyFollowers` reads the column default (`true`);
 *   - every push is a logged no-op (`[push] …`);
 *   - logout only bumps `token_version` (as in 4b).
 *
 * Order when migrating: `drizzle-kit migrate` → uncomment
 * `notifyFollowers` in src/db/schema.ts → flip this to `true` → deploy.
 * Never `true` on a DB without the tables: the bearer gate LEFT JOINs
 * `mobile_session` on every request (42P01 = 500 everywhere). The smoke
 * (`scripts/api-smoke.ts`) parses this line and checks it agrees with the DB.
 *
 * No `server-only` on purpose: pure constant, the smoke reads it as text and
 * scratch test harnesses alias it.
 */
export const MIGRATION_0029_LIVE = false;

/**
 * Android push (2026-09-30) — kill-switch for migration 0035
 * (`device_token.provider text NOT NULL DEFAULT 'apns'`).
 *
 * FALSE until the founder applies `drizzle/0035_device_token_provider.sql` to
 * the shared Neon DB (local = beta = prod). While false the code behaves
 * EXACTLY as before 0035, so it is safe to deploy without the column:
 *   - `PUT /me/devices/{token}` with `provider: "fcm"` answers 503
 *     `unavailable` + `reason: "fcm_pending"` (nothing is written); APNs
 *     registrations (`provider` absent or "apns") work as today;
 *   - `DELETE /me/devices/{token}` never reads the column: it works for both
 *     token shapes (an FCM token simply matches no row yet);
 *   - `pushToUsers` does not select the column and treats every row as APNs
 *     (true: nothing else could have been registered).
 *
 * Order when migrating: `pnpm exec drizzle-kit migrate` → uncomment
 * `provider` in `deviceTokens` (src/db/schema.ts) → flip this to `true` →
 * deploy. Never `true` on a DB without the column: the push query and the
 * device upsert name it (42703 = the registration 500s and every push
 * batch fails). The smoke (`scripts/api-smoke.ts`) parses this line and
 * checks it agrees with the DB.
 *
 * No `server-only` on purpose: pure constant, the smoke reads it as text.
 */
export const MIGRATION_0035_LIVE = true;

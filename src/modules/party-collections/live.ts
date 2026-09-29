/**
 * Kill-switch for migration 0033 (`party`, `party_invite`, `party_song`,
 * `backlog_collaborator.blocked_at`, `media_type` + 'track') — colecciones de
 * fiesta.
 *
 * FALSE until the founder applies `drizzle/0033_party_collections.sql` to the
 * shared Neon DB (local = beta = prod). While false the code behaves exactly
 * as before 0033, so it is safe to deploy — and the shared `next dev` keeps
 * working — without the tables:
 *   - `notPartyBacklog()` (gate.ts) is `true`: the generic collection reads
 *     (shelves, pickers, `GET /collections`, stats) don't reference `party`
 *     (no party can exist without the table anyway);
 *   - `ensureUserItemAndMembership` / `addTitleToBacklog` / `updateBacklog`
 *     skip their "is this a party?" probe;
 *   - `mergeAccounts` skips the party/collaborator statements;
 *   - every party entry point (module functions, server actions, `/api/v1/
 *     parties/**`, `/api/v1/invites/**`) answers "unavailable" (actions:
 *     `{ error: "unavailable" }`; API: 503 `unavailable`), and the anonymous
 *     reads: `getInvitePreview` throws (→ 503 / "las fiestas llegan muy pronto."),
 *     `getPartySummaryByToken` returns null with a warning.
 *
 * The library-format filters (`libraryMedia()`, catalog/library-media.ts) do
 * NOT depend on this switch: they are spelled `IN ('film','series','album')`
 * and are valid on either schema.
 *
 * Order when migrating: `drizzle-kit migrate` (applies 0033) → flip this to
 * `true` → deploy. Never `true` on a DB without the tables: the collection
 * reads would 500 (42P01) on every screen of Colecciones.
 *
 * No `server-only` on purpose: pure constant (scripts read it).
 */
export const MIGRATION_0033_LIVE = true;

/**
 * Kill-switch for migration 0034 (`music_connection`, `music_oauth_state`,
 * `party_export`, `party_export_item`) — "Llévala a otra app" (exportar una
 * colección de fiesta a Apple Music / TIDAL).
 *
 * FALSE until the founder applies `drizzle/0034_music_export.sql` to the
 * shared Neon DB (local = beta = prod). While false NOTHING of the export
 * touches the database and every entry point answers "unavailable":
 *   - API v1 (`/api/v1/music/**`, `/api/v1/parties/{id}/exports/**`) → 503
 *     `unavailable`;
 *   - web actions (`music-export-actions.ts`) → `{ error: "unavailable" }`;
 *   - web OAuth routes (`/api/music/tidal/*`) → redirect back with
 *     `?music=unavailable`.
 * The four tables are only declared in schema.ts — new tables change no
 * existing INSERT/SELECT, so declaring them before the migration is safe
 * (unlike a new column on a hot table, learning 2026-09-24-columna-declarada…).
 *
 * Order: `drizzle-kit migrate` (applies 0034) → flip to `true` → deploy.
 * No `server-only`: pure constant (scripts read it).
 */
export const MIGRATION_0034_LIVE = false;

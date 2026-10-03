import { redactedError } from "@/authz/safe-log";
import { withApi } from "@/authz/api";
import { getCatalogItems } from "@/modules/catalog/cache";
import { getNewFromCreators } from "@/modules/discover/creators-new";
import { json } from "../../_lib/http";
import { isoDate } from "../../_lib/schemas";
import { toTitleSummary } from "../../_lib/wire";

/**
 * GET /api/v1/discover/creators (§4 Descubrir · "lo nuevo de tus favoritos",
 * 2026-09-29) → `{ items: [{ title, releaseDate, creator: { name, role } }] }`.
 *
 * Recent and upcoming work by the artists, film directors and series
 * creators behind the caller's own favorites (`modules/discover/creators-new.ts`:
 * seeds from the caller's library, provider fan-out with timeouts, nothing the
 * caller already has). Its own route, apart from `/discover`, because the
 * fan-out is slow on a cold cache — the app asks for it after first paint.
 * `role` is `artist` | `director` | `creator`. Fail-open: a provider outage is
 * `items: []`, never an error.
 */
export const GET = withApi(async (_req, { user }) => {
  const found = await getNewFromCreators(user.id, Date.now(), 12).catch((err) => {
    console.error("[api] discover/creators unavailable:", redactedError(err));
    return [];
  });
  const rows = await getCatalogItems(found.map((f) => f.catalogItemId));
  const byId = new Map(rows.map((r) => [r.id, r]));
  return json({
    items: found.flatMap((f) => {
      const row = byId.get(f.catalogItemId);
      return row
        ? [{
            title: toTitleSummary(row),
            releaseDate: f.releaseDate ? isoDate(f.releaseDate) : null,
            creator: f.creator,
          }]
        : [];
    }),
  });
});

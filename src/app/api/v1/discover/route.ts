import { withApi } from "@/authz/api";
import { getLibraryUpcoming } from "@/modules/backlog/library";
import { getCatalogItems } from "@/modules/catalog/cache";
import { recCards } from "@/modules/recs/discover-cards";
import { getObsessionRails, type RailWork } from "@/modules/recs/discover-rails";
import { getTrendingAmongFollowed } from "@/modules/social/trending";
import { json } from "../_lib/http";
import { isoDate, type Title } from "../_lib/schemas";
import { toTitleSummary } from "../_lib/wire";

/**
 * GET /api/v1/discover (§4 Descubrir y búsqueda) → the three sections
 * Descubrir's home draws (app/(app)/descubrir/page.tsx), same reads and same
 * limits — cache and derived data only, NEVER the recommendation engine
 * (ADR-009 meters generations; a visit to Discover must stay free):
 *
 *  - `recommended`: the obsession rails interleaved into cards by the one
 *    shared rule (`modules/recs/discover-cards.ts`), each with its seed;
 *  - `trending`: what the people the caller follows touched this week
 *    (trending.ts gates every branch on `publicAuthor` + `backlogs.isPublic`);
 *    people are handles only;
 *  - `upcoming`: the caller's own library titles whose release is ahead.
 */

const KICKER = (seedTitle: string) => `Porque te obsesiona ${seedTitle}`;

function railTitle(w: RailWork): Title {
  return toTitleSummary({
    id: w.catalogItemId,
    title: w.title,
    mediaType: w.mediaType,
    year: w.year,
    byline: w.byline,
    posterUrl: w.posterUrl,
    paletteHex: w.paletteHex,
  });
}

export const GET = withApi(async (_req, { user }) => {
  const now = Date.now();
  const [rails, trending, upcoming] = await Promise.all([
    getObsessionRails(user.id, { maxRails: 4, perRail: 4 }),
    getTrendingAmongFollowed(user.id, new Date(now), 15),
    getLibraryUpcoming(user.id, now, 12),
  ]);
  // The upcoming strip's read is cover-only; hydrate the summary fields from
  // the shared catalog rows (one query, ≤12 ids).
  const rows = await getCatalogItems(upcoming.map((u) => u.catalogItemId));
  const byId = new Map(rows.map((r) => [r.id, r]));

  return json({
    recommended: recCards(rails).map((c) => ({
      title: railTitle(c.work),
      reason: KICKER(c.because),
      seedTitleId: c.seedTitleId,
    })),
    trending: trending.map((t) => ({
      title: toTitleSummary({
        id: t.catalogItemId,
        title: t.title,
        mediaType: t.mediaType,
        year: t.year,
        byline: t.byline,
        posterUrl: t.posterUrl,
        paletteHex: t.paletteHex,
      }),
      saves: t.count,
      people: t.people.map((p) => p.username),
    })),
    upcoming: upcoming.flatMap((u) => {
      const row = byId.get(u.catalogItemId);
      return row
        ? [{ title: toTitleSummary(row), releaseDate: isoDate(u.releaseDate) }]
        : [];
    }),
  });
});

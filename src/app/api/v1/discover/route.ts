import { withApi } from "@/authz/api";
import { getCatalogItems } from "@/modules/catalog/cache";
import { getMostAnticipated, type AnticipatedItem } from "@/modules/discover/anticipated";
import { recCards } from "@/modules/recs/discover-cards";
import { getObsessionRails } from "@/modules/recs/discover-rails";
import { getFollowedCollections } from "@/modules/social/followed-collections";
import { getKuraTrending } from "@/modules/social/trending";
import { releaseDatesFor } from "../_lib/catalog";
import { json } from "../_lib/http";
import { isoDate } from "../_lib/schemas";
import { toCollectionCardWire, toTitleSummary } from "../_lib/wire";

/**
 * GET /api/v1/discover (§4 Descubrir y búsqueda) → the three sections
 * Descubrir's home draws (app/(app)/descubrir/page.tsx), same reads and same
 * limits — cache and derived data only, NEVER the recommendation engine
 * (ADR-009 meters generations; a visit to Discover must stay free):
 *
 *  - `recommended`: the obsession rails interleaved into cards by the one
 *    shared rule (`modules/recs/discover-cards.ts`), each with its seed;
 *  - `trending`: what's trending on Kura this week — the titles the most
 *    public people touched (trending.ts gates every branch on `publicAuthor`
 *    + `backlogs.isPublic` + blocks); people are handles only; titles the
 *    caller already has are left out;
 *  - `upcoming` ("los más esperados", 2026-09-29): what's coming out that the
 *    caller does NOT have yet, ordered by how many Kura people saved it
 *    (`waiting`, counting only public people not blocked either way —
 *    `modules/discover/anticipated.ts`), then
 *    TMDB popularity, then soonest. `collection` is ALWAYS null now (these are
 *    never the caller's titles); it stays in the shape so installed iOS builds
 *    that decode it keep decoding;
 *  - `upcomingAlbums`: the same read and item shape restricted to albums
 *    (`{ mediaType: "album" }`, up to 12) — Kura DB only, TMDB is never asked;
 *  - `collections` ("Descubrir Final – Todo" 3a · "colecciones para ti · de
 *    gente que sigues"): showcased collections of people the caller follows
 *    (`social/followed-collections.ts`: `publicAuthor` + blocks +
 *    `is_public AND show_on_profile`, inside the query).
 * Each `recommended` card also carries `seed`, the obsession's own summary —
 * its cover sits tilted behind the reco's (3a).
 */

const KICKER = (seedTitle: string) => `Porque te obsesiona ${seedTitle}`;

export const GET = withApi(async (_req, { user }) => {
  const now = Date.now();
  const [rails, trending, upcoming, upcomingAlbums, collections] = await Promise.all([
    getObsessionRails(user.id, { maxRails: 4, perRail: 4 }),
    getKuraTrending(user.id, new Date(now), 15),
    getMostAnticipated(user.id, now, 20),
    getMostAnticipated(user.id, now, 12, { mediaType: "album" }),
    getFollowedCollections(user.id, 4),
  ]);
  const seedById = new Map(rails.map((r) => [r.seed.catalogItemId, r.seed]));
  const cards = recCards(rails);
  // The upcoming strip's read is cover-only; hydrate the summary fields from
  // the shared catalog rows (one query, ≤32 ids). The rails and trending rows
  // carry every summary fact but the release date — one slim lookup, in
  // parallel, so the added `release` costs no extra round-trip.
  const [rows, releaseDateOf] = await Promise.all([
    getCatalogItems([...upcoming, ...upcomingAlbums].map((u) => u.catalogItemId)),
    releaseDatesFor([
      ...cards.map((c) => c.work.catalogItemId),
      ...cards.map((c) => c.seedTitleId),
      ...trending.map((t) => t.catalogItemId),
    ]),
  ]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const anticipatedOut = (u: AnticipatedItem) => {
    const row = byId.get(u.catalogItemId);
    return row
      ? [{
          title: toTitleSummary(row),
          releaseDate: isoDate(u.releaseDate),
          collection: null,
          waiting: u.waiting,
        }]
      : [];
  };

  return json({
    recommended: cards.map((c) => {
      const seed = seedById.get(c.seedTitleId);
      return {
        title: toTitleSummary({ ...c.work, releaseDate: releaseDateOf(c.work.catalogItemId) }),
        reason: KICKER(c.because),
        seedTitleId: c.seedTitleId,
        seed: seed ? toTitleSummary({ ...seed, releaseDate: releaseDateOf(seed.catalogItemId) }) : null,
      };
    }),
    trending: trending.map((t) => ({
      title: toTitleSummary({ ...t, releaseDate: releaseDateOf(t.catalogItemId) }),
      saves: t.count,
      people: t.people.map((p) => p.username),
    })),
    upcoming: upcoming.flatMap(anticipatedOut),
    upcomingAlbums: upcomingAlbums.flatMap(anticipatedOut),
    collections: collections.map(toCollectionCardWire),
  });
});

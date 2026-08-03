import "server-only";
import { and, asc, desc, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { catalogItems, userItems } from "@/db/schema";
import { cacheExternalItems } from "@/modules/catalog/search";
import { getArtistUpcoming } from "@/modules/catalog/itunes";
import type { UpcomingItem } from "@/components/upcoming-shelf";

/**
 * An UpcomingItem plus the artist. Declared as an EXTENSION and not as its own
 * matching field list: the Novedades sheet renders one of these or one of
 * those in the same slot, which only typechecks while the shapes agree — and
 * nothing was holding them together except that they happened to be written
 * the same way. `byline` is the one real difference: the sheet's copy names
 * the artist ("el de RØZ & Young Cister"), the shelf doesn't render it.
 */
export interface FollowSuggestion extends UpcomingItem {
  byline: string | null;
}

/** How many of the user's artists to ask about before falling back. */
const ARTISTS_TRIED = 6;

/**
 * F3.8 / Novedades 6b — a REAL unreleased album to demonstrate the countdown
 * on, so the sheet shows something concrete instead of describing a feature.
 *
 * Two steps, best first:
 *   1. An artist they already have. Ideal, and usually empty-handed — a
 *      pre-order window is a few weeks and most people here have 2-4 artists.
 *   2. ANYTHING unreleased already in the catalog. Not personalised, and the
 *      copy never claims it is; a real record coming out next week beats a
 *      sheet that doesn't appear.
 *
 * Null only when the catalog knows of nothing unreleased at all — and null
 * means no sheet, which is the right outcome for having nothing to show.
 */
export async function getFollowSuggestion(
  userId: string,
): Promise<FollowSuggestion | null> {
  const owned = await ownedAlbums(userId);
  const alreadyHave = new Set(owned.map((o) => o.catalogItemId));
  return (
    (await byTheirArtists(owned, alreadyHave)) ??
    (await anythingComing(alreadyHave))
  );
}

/** Albums this user owns, newest first. `raw` carries the iTunes payload, which
 *  is where artistId lives — it was never worth a column of its own. */
async function ownedAlbums(userId: string) {
  return db
    .select({ catalogItemId: catalogItems.id, raw: catalogItems.raw })
    .from(userItems)
    .innerJoin(catalogItems, eq(userItems.catalogItemId, catalogItems.id))
    .where(
      and(
        eq(userItems.userId, userId),
        eq(catalogItems.mediaType, "album"),
        eq(catalogItems.source, "itunes"),
      ),
    )
    .orderBy(desc(userItems.addedAt));
}

/**
 * Step 1 — ask the discographies of artists they already have.
 *
 * WHY A LOOKUP AND NOT A SEARCH: searching the artist's NAME and keeping the
 * results with no year (the pre-order signature) returns nothing, ever.
 * Verified against two artists who demonstrably have one (Mastodon → Marrow
 * Deep, benny blanco → Hermoso): the name search comes back with 15-23 released
 * albums and not one unreleased, because iTunes ranks by relevance and a record
 * whose tracks are still called "Track 4" ranks nowhere. The artist lookup has
 * no ranking to lose to, and carries releaseDate in the payload itself.
 */
async function byTheirArtists(
  owned: Awaited<ReturnType<typeof ownedAlbums>>,
  alreadyHave: Set<string>,
): Promise<FollowSuggestion | null> {
  const artistIds: number[] = [];
  for (const o of owned) {
    const id = (o.raw as { artistId?: unknown } | null)?.artistId;
    if (typeof id === "number" && !artistIds.includes(id)) artistIds.push(id);
    if (artistIds.length === ARTISTS_TRIED) break;
  }

  for (const artistId of artistIds) {
    try {
      const upcoming = await getArtistUpcoming(artistId);
      if (upcoming.length === 0) continue;

      // Upserting is what turns a provider payload into something followable:
      // the row (and its id) has to exist before it can join a backlog.
      const cached = await cacheExternalItems(upcoming);
      const pick = cached.find((c) => !alreadyHave.has(c.catalogItemId));
      if (!pick) continue;

      // Read the date back off the row instead of correlating the upsert's
      // output to its input by position — the write already persisted it, so
      // the stored value is authoritative and needs no zipping.
      const [row] = await db
        .select({ releaseDate: catalogItems.releaseDate })
        .from(catalogItems)
        .where(eq(catalogItems.id, pick.catalogItemId))
        .limit(1);
      if (!row?.releaseDate || row.releaseDate.getTime() <= Date.now()) continue;

      return {
        catalogItemId: pick.catalogItemId,
        title: pick.title,
        byline: pick.byline,
        posterUrl: pick.posterUrl,
        releaseDate: row.releaseDate.toISOString(),
      };
    } catch (err) {
      // One artist failing (rate limit, network) must not cost the whole search.
      console.error(`[F3.8] follow suggestion, artist ${artistId}:`, err);
    }
  }
  return null;
}

/**
 * Step 2 — anything unreleased the catalog already knows about, soonest first.
 * Zero network: these rows exist because somebody else surfaced them, and the
 * sooner it comes out the better it demonstrates a countdown.
 */
async function anythingComing(
  alreadyHave: Set<string>,
): Promise<FollowSuggestion | null> {
  const rows = await db
    .select({
      catalogItemId: catalogItems.id,
      title: catalogItems.title,
      byline: catalogItems.byline,
      posterUrl: catalogItems.posterUrl,
      releaseDate: catalogItems.releaseDate,
    })
    .from(catalogItems)
    .where(
      and(
        eq(catalogItems.mediaType, "album"),
        gt(catalogItems.releaseDate, new Date()),
      ),
    )
    .orderBy(asc(catalogItems.releaseDate))
    .limit(10);

  const pick = rows.find((r) => !alreadyHave.has(r.catalogItemId));
  if (!pick?.releaseDate) return null;
  return {
    catalogItemId: pick.catalogItemId,
    title: pick.title,
    byline: pick.byline,
    posterUrl: pick.posterUrl,
    releaseDate: pick.releaseDate.toISOString(),
  };
}

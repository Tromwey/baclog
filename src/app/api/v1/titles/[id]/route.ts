import { z } from "zod";
import { withApi, ApiError } from "@/authz/api";
import { SERVICE_LABEL } from "@/app/(app)/item/[catalogItemId]/labels";
import { getUserCatalogEntry } from "@/modules/backlog/queries";
import { getTitleStats } from "@/modules/backlog/title-stats";
import { getCatalogItem, type CatalogItemRow } from "@/modules/catalog/cache";
import { getItemDisplayMedia } from "@/modules/catalog/display-media";
import type { AlbumTrack } from "@/modules/catalog/itunes";
import type { SeriesStatus } from "@/modules/catalog/series-status";
import { getItemReviewContext } from "@/modules/reviews/queries";
import { getTitleActivityAmongFollowed } from "@/modules/social/title-activity";
import { json } from "../../_lib/http";
import {
  isoDate,
  type PublicMark,
  type Review,
  type Title,
  type TitleState,
  type Track,
  type WatchOption,
} from "../../_lib/schemas";
import { releaseOf, toTitleState, toTitleSummary } from "../../_lib/wire";

/**
 * GET /api/v1/titles/{id} (§4 Títulos) — the ficha: the FULL `Title` (detail
 * fields on top of the summary), the caller's own `state`, the people they
 * follow who did something with it, the first page of public reviews (own
 * pinned first) and the caller's collections it is filed under.
 *
 * Same truth as the web ficha (app/(app)/item/[catalogItemId]/page.tsx):
 * identical module calls in the same order — the display media is read AFTER
 * the row because for an album it refreshes `release_date` (F3.8) and the
 * release must come off the returned value, not the row loaded before it.
 *
 * Cross-user reads here are the ones the web page already makes and each one
 * gates itself (title-activity.ts + reviews/queries.ts re-check
 * `publicAuthor` inside the query; title-stats.ts is a bare count). Nothing
 * new is exposed.
 */

const IdSchema = z.string().uuid();

/** "125 min" · "2 temporadas" · "18 canciones" — null when we have no data. */
function detailOf(
  item: CatalogItemRow,
  media: { trackCount: number; seriesStatus: SeriesStatus | null },
): string | null {
  switch (item.mediaType) {
    case "film": {
      // The stored TMDB search payload carries no runtime; a details payload
      // would. Read it if it's there, never invent it.
      const raw = item.raw as { runtime?: unknown } | null;
      const runtime = typeof raw?.runtime === "number" ? raw.runtime : 0;
      return runtime > 0 ? `${Math.round(runtime)} min` : null;
    }
    case "series": {
      const seasons = media.seriesStatus?.seasons ?? 0;
      if (seasons <= 0) return null;
      return seasons === 1 ? "1 temporada" : `${seasons} temporadas`;
    }
    case "album": {
      const n = media.trackCount;
      if (n <= 0) return null;
      return n === 1 ? "1 canción" : `${n} canciones`;
    }
  }
}

/** iTunes tracks → wire. Placeholders ("Track 4") never reach here (itunes.ts
 *  drops them), so every listed track is playable: `available` is true. */
function tracksOf(tracks: AlbumTrack[]): Track[] {
  return tracks.map((t, i) => ({
    number: t.n > 0 ? t.n : i + 1,
    name: t.name,
    available: true,
    durationMs:
      typeof t.durationMs === "number" && Number.isInteger(t.durationMs) && t.durationMs >= 0
        ? t.durationMs
        : null,
  }));
}

/**
 * ONE link-out, unresolved: `/api/links/resolve` answers a 302 without a
 * session and takes `?service=`, so the app just opens the URL. The service
 * is pinned explicitly because the app has no cookie for the route to read
 * the preference from (its default is Spotify, same as the route's).
 */
function watchOf(
  origin: string,
  item: CatalogItemRow,
  preferredService: keyof typeof SERVICE_LABEL | null,
): WatchOption {
  const url = new URL("/api/links/resolve", origin);
  url.searchParams.set("catalogItemId", item.id);
  if (item.mediaType === "album") {
    const service = preferredService ?? "spotify";
    url.searchParams.set("service", service);
    return { short: "escuchar", name: SERVICE_LABEL[service], kind: service, url: url.toString() };
  }
  return { short: "ver", name: "Dónde verla", kind: "justwatch", url: url.toString() };
}

export const GET = withApi<{ id: string }>(async (req, { user, params }) => {
  const parsed = IdSchema.safeParse(params.id);
  // A malformed id is the same 404 as an unknown one — no shape oracle.
  if (!parsed.success) throw new ApiError("not_found");
  const id = parsed.data;

  const [item, entry, reviewCtx, stats] = await Promise.all([
    getCatalogItem(id),
    getUserCatalogEntry(user.id, id),
    getItemReviewContext(user.id, id),
    getTitleStats(id),
  ]);
  if (!item) throw new ApiError("not_found");

  const [media, activity] = await Promise.all([
    getItemDisplayMedia(item),
    getTitleActivityAmongFollowed(user.id, item.id, {
      limit: 4,
      mediaType: item.mediaType,
    }),
  ]);

  const title: Title = {
    ...toTitleSummary(item),
    genre: item.genre,
    synopsis: media.synopsis,
    detail: detailOf(item, media),
    release: releaseOf(media.releaseDate ?? item.releaseDate, item.year),
    tracks: item.mediaType === "album" ? tracksOf(media.tracks) : [],
    trackCount: item.mediaType === "album" ? media.trackCount : null,
    seriesStatus: media.seriesStatus,
    counts: stats,
    watch: [watchOf(new URL(req.url).origin, item, user.preferredService)],
  };

  const own = reviewCtx.own;
  const state: TitleState | null = entry
    ? toTitleState({
        catalogItemId: entry.catalogItemId,
        status: entry.status,
        verdict: entry.verdict,
        obsessed: entry.obsessed,
        addedAt: entry.addedAt,
        reviewId: own?.id ?? null,
      })
    : null;

  const following = activity.rows.map((r) => ({
    handle: r.username,
    mark: (r.state === "done" ? "completed" : r.state) as PublicMark | null,
  }));

  // Own review first (its author always sees it, hidden or not), then the
  // public page. `hidden` rides only on the own card.
  const items: Review[] = [];
  if (own) {
    items.push({
      id: own.id,
      authorHandle: user.username ?? "",
      titleId: item.id,
      body: own.body,
      hasSpoiler: own.hasSpoiler,
      mark: own.mark,
      // The server read always sets both; the optional-ness is for the web's
      // optimistic client copy of this shape (reviews/types.ts).
      createdAt: isoDate(own.createdAt ?? own.updatedAt ?? new Date()),
      updatedAt: isoDate(own.updatedAt ?? own.createdAt ?? new Date()),
      hidden: own.hidden,
    });
  }
  for (const r of reviewCtx.reviews) {
    items.push({
      id: r.id,
      authorHandle: r.author.username,
      titleId: item.id,
      body: r.body,
      hasSpoiler: r.hasSpoiler,
      mark: r.mark,
      createdAt: isoDate(r.createdAt),
      updatedAt: isoDate(r.updatedAt),
    });
  }

  return json({
    title,
    state,
    following,
    reviews: { items, nextCursor: reviewCtx.nextCursor },
    collections: entry?.backlogs.map((b) => b.id) ?? [],
  });
});

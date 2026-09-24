import { withApi, ApiError } from "@/authz/api";
import { SERVICE_LABEL } from "@/app/(app)/item/[catalogItemId]/labels";
import { getUserCatalogEntry } from "@/modules/backlog/queries";
import { getTitleStats } from "@/modules/backlog/title-stats";
import { getCatalogItem, type CatalogItemRow } from "@/modules/catalog/cache";
import { getItemDisplayMedia } from "@/modules/catalog/display-media";
import { getItemReviewContext } from "@/modules/reviews/queries";
import {
  getTitleActivityAmongFollowed,
  type ActivityState,
} from "@/modules/social/title-activity";
import { json, parseId } from "../../_lib/http";
import {
  type PublicMark,
  type Review,
  type Title,
  type TitleState,
  type WatchOption,
} from "../../_lib/schemas";
import {
  releaseOf,
  titleDetailOf,
  toOwnReview,
  toPublicReview,
  toTitleState,
  toTitleSummary,
  toTracks,
} from "../../_lib/wire";

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
 *
 * 503 `unavailable` for an ALBUM whose iTunes lookup failed and for which
 * there is no tracklist to show (`mediaUnavailable`): the ficha's core is the
 * tracklist, and an empty one would read as "no songs". The web keeps its
 * fail-open render; video titles never 503 here (their detail is cached).
 */

/** title-activity's glyph state → the wire's public mark. */
const ACTIVITY_MARK: Record<ActivityState, PublicMark> = {
  obsessed: "obsessed",
  done: "completed",
  liked: "liked",
};

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
  // A malformed id is the same 404 as an unknown one — no shape oracle.
  const id = parseId(params.id);

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
  if (item.mediaType === "album" && media.mediaUnavailable && media.tracks.length === 0) {
    throw new ApiError("unavailable");
  }

  const title: Title = {
    ...toTitleSummary(item),
    genre: item.genre,
    synopsis: media.synopsis,
    detail: titleDetailOf({
      mediaType: item.mediaType,
      runtimeMinutes: media.runtimeMinutes,
      seasons: media.seriesStatus?.seasons ?? null,
      trackCount: media.trackCount,
    }),
    release: releaseOf(media.releaseDate ?? item.releaseDate, item.year),
    tracks: item.mediaType === "album" ? toTracks(media.tracks) : [],
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
    mark: r.state ? ACTIVITY_MARK[r.state] : null,
  }));

  // Own review first (its author always sees it, hidden or not), then the
  // public page — which never repeats it (`getOthersReviewsPage` excludes the
  // caller on every page, including `GET /titles/{id}/reviews`). `hidden`
  // rides only on the own card; `authorHandle` is null, never "", without a
  // handle (`_lib/wire/review.ts`).
  const items: Review[] = [];
  if (own) items.push(toOwnReview(own, item.id, user.username));
  for (const r of reviewCtx.reviews) items.push(toPublicReview(r, item.id));

  return json({
    title,
    state,
    following,
    reviews: { items, nextCursor: reviewCtx.nextCursor },
    collections: entry?.backlogs.map((b) => b.id) ?? [],
  });
});

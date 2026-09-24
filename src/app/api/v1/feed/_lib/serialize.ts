import "server-only";
import { isoDate, type FeedEvent as WireFeedEvent } from "@/app/api/v1/_lib/schemas";
import { toTitleSummary } from "@/app/api/v1/_lib/wire";
import type { FeedEvent, FeedSuggestion } from "@/modules/social/types";

/**
 * Feed events → wire `FeedEvent` (§3). The module's events are already the
 * public-safe projection (every branch of fetchFeedChunk gates `publicAuthor`
 * and, for adds, `backlogs.isPublic`); this only reshapes:
 *  - `author` keeps handle + photo + the two ADN hexes, nothing else;
 *  - the title travels as a SUMMARY so the app needn't hydrate;
 *  - `mark`: an `obsessed` event IS the mark; completions/reviews carry the
 *    author's mark the module already computed (verdict gated to completed);
 *  - `collectionId`/`collectionName` only on `added`, `reviewId`/`reviewBody`
 *    only on `reviewed`, `releaseDate` only while the add is "no puede
 *    esperar" (F3.8: it expires by itself on release day).
 */
export function toWireFeedEvent(e: FeedEvent): WireFeedEvent {
  return {
    id: e.id,
    kind: e.kind,
    at: isoDate(e.at),
    author: {
      handle: e.author.username,
      avatarUrl: e.author.avatarUrl,
      hexes: e.author.avatarHexes,
    },
    titleId: e.catalogItemId,
    title: toTitleSummary({
      id: e.catalogItemId,
      title: e.title,
      mediaType: e.mediaType,
      year: e.year,
      byline: e.byline,
      posterUrl: e.posterUrl,
      paletteHex: e.paletteHex,
    }),
    mark: e.kind === "obsessed" ? "obsessed" : e.mark,
    collectionId: e.kind === "added" ? e.backlogId : null,
    collectionName: e.kind === "added" ? e.backlogName : null,
    releaseDate: e.kind === "added" && e.releaseDate ? isoDate(e.releaseDate) : null,
    reviewId: e.kind === "reviewed" ? e.id.slice("reviewed:".length) : null,
    reviewBody: e.kind === "reviewed" ? e.reviewBody : null,
    hasSpoiler: e.kind === "reviewed" ? e.hasSpoiler : false,
    suggest: null,
  };
}

/** The one "Quizá quieras seguir" card as a `suggest` event: `author` is the
 *  suggested person, `suggest` the reason and the covers' title ids. */
export function toWireSuggestion(s: FeedSuggestion, now: Date): WireFeedEvent {
  return {
    id: `suggest:${s.username}`,
    kind: "suggest",
    at: isoDate(now),
    author: {
      handle: s.username,
      avatarUrl: s.avatarUrl,
      hexes: s.avatarHexes,
    },
    titleId: null,
    title: null,
    mark: null,
    collectionId: null,
    collectionName: null,
    releaseDate: null,
    reviewId: null,
    reviewBody: null,
    hasSpoiler: false,
    suggest: {
      reason: s.reason,
      common: s.common,
      titleIds: s.covers.map((c) => c.catalogItemId),
    },
  };
}

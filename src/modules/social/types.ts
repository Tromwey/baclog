import type { MediaType } from "@/modules/catalog/types";
import type { ReviewAuthor } from "@/modules/reviews/types";

/**
 * F3.10 Feed social — the shapes that cross the server/client boundary.
 * No "server-only": client components (feed list, follow lists) import these.
 */

/**
 * The knobs that shape a feed page — kept together because they constrain
 * each other: getFeedCards pulls chunks of FEED_EVENT_CHUNK events until the
 * page holds MORE than FEED_CARDS_PER_PAGE cards, giving up after
 * FEED_MAX_CHUNKS. So FEED_EVENT_CHUNK × FEED_MAX_CHUNKS (144) is the longest
 * run of adds one burst can absorb before it is cut (and continues on the
 * next page) — raise the page target and that budget has to grow with it.
 */
export const FEED_EVENT_CHUNK = 24;
/** MINIMUM cards per feed page — a burst counts as ONE card (design v2). A
 *  page ships every CLOSED card its chunks produced, so it's usually more. */
export const FEED_CARDS_PER_PAGE = 12;
export const FEED_MAX_CHUNKS = 6;

/** Page size of the siguiendo/seguidores lists. */
export const PEOPLE_PAGE_SIZE = 30;

/**
 * The four SOURCES of a feed card. "No puede esperar" is deliberately not a
 * kind: it's an `added` event whose title hasn't been released yet (`waiting`
 * below), so it changes back into an ordinary add on release day by itself —
 * derived state, nothing to clean up (the F3.8 rule).
 */
export type FeedEventKind = "added" | "completed" | "obsessed" | "reviewed";

export interface FeedEvent {
  /** `${kind}:${sourceRowId}` — unique across the union, and the keyset tiebreak. */
  id: string;
  kind: FeedEventKind;
  /** ISO instant of the event — drives the time buckets that lift the gems
   *  (feed v2) and re-encodes the keyset cursor at a page cut. */
  at: string;
  /** Pre-formatted on the server ("hace 2 d") — same formatter as reviews. */
  when: string;
  author: ReviewAuthor;
  catalogItemId: string;
  title: string;
  mediaType: MediaType;
  mediaTypeLabel: string;
  year: number | null;
  byline: string | null;
  posterUrl: string | null;
  /** "faltan 12 días" when the title is still unreleased — flips the card to
   *  its "No puede esperar" flavor. Null once it's out. */
  waiting: string | null;
  /** The destination backlog — `added` events only. The id is what bursts
   *  key on (names aren't unique per user); it is also the public URL segment
   *  (/u/{username}/{backlogId}) — the query already gates on isPublic. */
  backlogId: string | null;
  backlogName: string | null;
  /** The author's mark, rendered at the metadata tier (never above it). */
  mark: "obsessed" | "liked" | "disliked" | null;
  /** `reviewed` events only. */
  reviewBody: string | null;
  hasSpoiler: boolean;
}

/**
 * Feed v2 (design "Feed poblado v2", 2026-09-02): the feed renders CARDS,
 * not events. Consecutive adds by the same author to the same backlog fold
 * into one BURST; everything else is a single, at one of two densities the
 * card component picks from the kind (obsessed/reviewed = gem, big; added/
 * completed = compact, one row).
 */
export interface FeedBurst {
  kind: "burst";
  /** `burst:${newestEventId}` */
  id: string;
  author: ReviewAuthor;
  /** Relative time of the NEWEST add in the run. */
  when: string;
  backlogId: string;
  backlogName: string;
  /** Newest first — the cover strip and the expanded rows. The count and the
   *  per-type tally are derived from this on render, never shipped twice. */
  items: FeedEvent[];
}

export interface FeedSingle {
  kind: "single";
  event: FeedEvent;
}

export type FeedCard = FeedBurst | FeedSingle;

/** What /feed and "Ver más" actually render. */
export interface FeedCardsPage {
  cards: FeedCard[];
  /** Opaque `${atIso}|${eventId}` cursor for the next page; null when done. */
  nextCursor: string | null;
  /** How many people the viewer follows — rides along because the feed query
   *  already loads the ids, and the page's empty states branch on it. */
  followingCount: number;
}

/** A public profile offered in the feed's empty states. NOT `FollowSuggestion`:
 * modules/backlog/follow-suggestion.ts already exports that name for an
 * unrelated concept (an unreleased ALBUM to follow, F3.8 Novedades), and two
 * same-named exports one auto-import apart is how the wrong one gets picked. */
export interface SuggestedProfile {
  username: string;
  name: string;
  isFounder: boolean;
  avatarHexes: [string, string];
  backlogCount: number;
  followerCount: number;
  /** Up to 3 recent covers, native aspect (2:3 video / 1:1 album). */
  covers: { posterUrl: string; mediaType: MediaType }[];
  /** Titles beyond the covers shown — the "+128" tail. 0 hides it. */
  moreCount: number;
  /** "hoy" | "ayer" | null — bucketed last activity, gender-neutral copy. */
  lastActive: "hoy" | "ayer" | null;
}

/** One row of the siguiendo/seguidores lists. */
export interface PersonRow {
  username: string;
  name: string;
  isFounder: boolean;
  /** They went private after the follow — row dims, activity is gone. */
  isPrivate: boolean;
  avatarHexes: [string, string];
  backlogCount: number;
  /** Whether the VIEWER follows them (pre-seeds the button on both tabs). */
  following: boolean;
}

export interface PeoplePage {
  people: PersonRow[];
  /** Followers without a public handle — shown as one aggregate line. */
  privateCount: number;
  nextCursor: string | null;
}

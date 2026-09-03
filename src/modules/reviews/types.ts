/**
 * F3.9 Reseñas — the shapes that cross the server/client boundary.
 *
 * No "server-only" here: client components import these types, and `format.ts`
 * next to it is deliberately isomorphic too.
 */

/** Max length of a review body. Product-visible (the 280 counter). */
export const REVIEW_MAX_LENGTH = 280;

/** First page of the feed, and how many each "Ver más" adds. */
export const REVIEW_PAGE_SIZE = 8;
export const REVIEW_MORE_SIZE = 10;

/**
 * The author's reaction to the title, shown as a glyph + label next to the
 * date. Null is possible: the reaction UNLOCKS writing, but the author can
 * clear their verdict afterwards and the review stays. The card then simply
 * shows the date.
 */
export type ReviewMark = "obsessed" | "liked" | "disliked" | null;

export interface ReviewAuthor {
  username: string;
  /** First grapheme of the username, uppercased — the fallback when there is
   *  no photo (F3.11): punched out of the ADN orb. */
  initial: string;
  /** Two ADN hexes for the avatar aura (dominant colors of their library). */
  avatarHexes: [string, string];
  /** F3.11 — their profile photo (`/api/avatar/{key}`), null for the orb. */
  avatarUrl: string | null;
}

export interface FeedReview {
  id: string;
  body: string;
  hasSpoiler: boolean;
  mark: ReviewMark;
  /** Pre-formatted on the server ("hace 2 d") — see queries.ts. */
  when: string;
  author: ReviewAuthor;
}

/**
 * The viewer's own review. Never hidden from its author, spoiler or not, and
 * carrying no author block: the card says "Tú", and the avatar comes from the
 * viewer's own ADN, which the page already has.
 */
export interface OwnReview {
  id: string;
  body: string;
  hasSpoiler: boolean;
  mark: ReviewMark;
  when: string;
  /** Hidden by moderation: out of the feed, still visible to its author. */
  hidden: boolean;
}

export interface ReviewFeedPage {
  reviews: FeedReview[];
  /** Opaque `${createdAtIso}|${id}` cursor for the next page; null when done. */
  nextCursor: string | null;
}

/** Everything the in-app block needs, in one server round-trip. */
export interface ItemReviewContext extends ReviewFeedPage {
  own: OwnReview | null;
  /**
   * Public, non-hidden reviews of this title — the header count. A private
   * viewer's own review is NOT in here, because it isn't in any feed either.
   */
  total: number;
}

/**
 * The report sheet's motives. Same question and same shape as the profile
 * report (F2.21), with two reasons only a review can have — an unmarked spoiler
 * and a review that isn't about the work — and without `impersonation`, which
 * 280 characters can't do. Ids are `report_reason` enum values; the action
 * re-validates against this list, so it is the single source of truth.
 */
export const REVIEW_REPORT_REASONS = [
  { id: "unmarked_spoiler", label: "Spoiler sin marcar" },
  { id: "spam", label: "Spam" },
  { id: "harassment", label: "Acoso" },
  { id: "hate", label: "Odio o discriminación" },
  { id: "illegal_content", label: "Contenido ilegal" },
  { id: "off_topic", label: "No habla de la obra" },
  { id: "other", label: "Otro" },
] as const;

export type ReviewReportReason = (typeof REVIEW_REPORT_REASONS)[number]["id"];

/** One of the author's reviews, for the "Lo que dice X" profile section. */
export interface ProfileReview {
  id: string;
  catalogItemId: string;
  title: string;
  mediaTypeLabel: string;
  body: string;
  hasSpoiler: boolean;
  mark: ReviewMark;
  when: string;
}

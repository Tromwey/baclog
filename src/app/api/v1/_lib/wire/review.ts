import { isoDate, type PublicMark, type Review } from "../schemas";

/**
 * `Review` (§3) from the review rows the modules already return. ONE place for
 * the three emitters — `GET /titles/{id}` (own pinned + first page),
 * `GET /titles/{id}/reviews` (next pages) and `PUT /me/titles/{id}/review` —
 * so `authorHandle` can't drift between them.
 *
 * `authorHandle` is `users.username` as is, and `null` — never `""` — for an
 * account without a handle (only ever the caller's OWN review: public reviews
 * are gated on `username IS NOT NULL`). `reviews/queries.ts` pads a missing
 * username to `""` for the web avatar initial; the wire must not inherit that.
 *
 * Pure: no "server-only", no DB — `scripts/check-wire.ts` runs it under tsx.
 */

/** A handle or null — an empty string is "no handle", never a handle. */
export function handleOrNull(username: string | null | undefined): string | null {
  return typeof username === "string" && username.length > 0 ? username : null;
}

interface ReviewFacts {
  id: string;
  body: string;
  hasSpoiler: boolean;
  mark: PublicMark | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

/** Someone's PUBLIC review (the feed page rows). Never carries `hidden`. */
export function toPublicReview(
  row: ReviewFacts & { author: { username: string | null } },
  titleId: string,
): Review {
  return {
    id: row.id,
    authorHandle: handleOrNull(row.author.username),
    titleId,
    body: row.body,
    hasSpoiler: row.hasSpoiler,
    mark: row.mark,
    createdAt: isoDate(row.createdAt),
    updatedAt: isoDate(row.updatedAt),
  };
}

/** The caller's OWN review: `hidden` rides only here (moderation hid it). */
export function toOwnReview(
  row: ReviewFacts & { hidden: boolean },
  titleId: string,
  ownUsername: string | null,
): Review {
  return {
    id: row.id,
    authorHandle: handleOrNull(ownUsername),
    titleId,
    body: row.body,
    hasSpoiler: row.hasSpoiler,
    mark: row.mark,
    createdAt: isoDate(row.createdAt),
    updatedAt: isoDate(row.updatedAt),
    hidden: row.hidden,
  };
}

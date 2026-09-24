import { kuraMarkOf } from "@/modules/backlog/mark";
import { isoDate, type TitleState } from "../schemas";

/**
 * `TitleState` (§3) — the caller's OWN per-title state, straight off
 * `user_item` (never `backlog_item`: membership carries no state, AGENTS.md).
 * `addedAt` here is `user_item.addedAt` = the first membership, so a title
 * filed in two collections reports one `savedAt`.
 */

export interface TitleStateInput {
  catalogItemId: string;
  status: string;
  verdict: string | null;
  obsessed: boolean;
  /** `user_item.addedAt`. */
  addedAt: Date;
  /** The caller's `item_review.id` for this title, when they wrote one. */
  reviewId?: string | null;
}

export function toTitleState(row: TitleStateInput): TitleState {
  return {
    titleId: row.catalogItemId,
    mark: kuraMarkOf(row),
    savedAt: isoDate(row.addedAt),
    reviewId: row.reviewId ?? null,
  };
}

"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getCurrentUser } from "@/auth";
import { assertOwnsUserItem, assertUser } from "@/authz";
import { db } from "@/db";
import { itemReviews, reports } from "@/db/schema";
import { getReviewFeedPage } from "@/modules/reviews/queries";
import { deleteOwnReview, saveReview } from "@/modules/reviews/write";
import {
  REVIEW_MORE_SIZE,
  REVIEW_REPORT_REASONS,
  type ReviewFeedPage,
  type ReviewReportReason,
} from "@/modules/reviews/types";

/**
 * F3.9 — the review mutations. Every one of them keys on the catalog item and
 * resolves the caller's own row; none can reach another user's review (the
 * moderation actions, which by definition do, live in their own admin-gated
 * file — review-moderation-actions.ts).
 */

export type SaveReviewResult =
  | { ok: true }
  | { error: "invalid" | "link" | "locked" | "failed" };

/**
 * Publish or edit the caller's review of a title. The rules (react first,
 * no links, ≤280, albums never carry a spoiler flag, editing does NOT clear
 * `hiddenAt`) live in `modules/reviews/write.ts` — the same code the API's
 * `PUT /me/titles/{id}/review` runs. This wrapper only proves ownership
 * (`assertOwnsUserItem`: the title is in their library) and revalidates.
 */
export async function saveReviewAction(input: {
  catalogItemId: string;
  body: string;
  hasSpoiler: boolean;
}): Promise<SaveReviewResult> {
  const { user, item } = await assertOwnsUserItem(input.catalogItemId);

  let result: Awaited<ReturnType<typeof saveReview>>;
  try {
    result = await saveReview(user.id, item.catalogItemId, {
      body: input.body,
      hasSpoiler: input.hasSpoiler,
    });
  } catch (err) {
    console.error("[F3.9] save review failed:", err);
    return { error: "failed" };
  }
  if ("error" in result) {
    // `not_found` can't happen after assertOwnsUserItem (same row, same
    // request) — if the row vanished in between, surface it as a failure.
    return { error: result.error === "not_found" ? "failed" : result.error };
  }

  revalidatePath(`/item/${input.catalogItemId}`);
  return { ok: true };
}

/** Delete the caller's own review. The ⋯ menu two-tap-confirms before this. */
export async function deleteReviewAction(catalogItemId: string) {
  const { user, item } = await assertOwnsUserItem(catalogItemId);
  await deleteOwnReview(user.id, item.catalogItemId);
  revalidatePath(`/item/${catalogItemId}`);
  return { ok: true as const };
}

/**
 * "Ver más reseñas". Deliberately session-OPTIONAL: the same button exists on
 * the anonymous public item page, and the underlying query is public-gated
 * either way. A signed-in caller just gets their own review filtered out of the
 * page, since it's pinned above the feed.
 */
export async function loadMoreReviewsAction(input: {
  catalogItemId: string;
  cursor: string;
  /** The pinned review on the public item page, kept out of the pages below it. */
  excludeUsername?: string;
}): Promise<ReviewFeedPage> {
  const id = z.string().min(1).max(64).safeParse(input.catalogItemId);
  const cursor = z.string().min(1).max(120).safeParse(input.cursor);
  const owner = z.string().max(30).optional().safeParse(input.excludeUsername);
  if (!id.success || !cursor.success || !owner.success) {
    return { reviews: [], nextCursor: null };
  }

  const viewer = await getCurrentUser();
  return getReviewFeedPage(id.data, {
    excludeUserId: viewer?.id ?? null,
    excludeUsername: owner.data ?? null,
    cursor: cursor.data,
    limit: REVIEW_MORE_SIZE,
  });
}

/**
 * Report someone else's review. Signed-in only — the public page shows no ⋯
 * for anonymous viewers, and a report with nobody behind it is worth less than
 * the abuse surface it opens.
 *
 * `targetUserId` carries the review's AUTHOR so the moderation queue gets
 * repeat-offender context without a second join. Like the profile report, the
 * response is always the same: it never confirms whether the review exists,
 * whether it was already reported, or whether anything happened.
 */
const REVIEW_REASONS = REVIEW_REPORT_REASONS.map((r) => r.id) as [
  ReviewReportReason,
  ...ReviewReportReason[],
];

export async function reportReviewAction(input: {
  reviewId: string;
  reason: ReviewReportReason;
}) {
  const user = await assertUser();
  const parsed = z
    .object({ reviewId: z.string().min(1), reason: z.enum(REVIEW_REASONS) })
    .safeParse(input);
  if (!parsed.success) return { ok: true as const };

  const [review] = await db
    .select({ id: itemReviews.id, authorId: itemReviews.userId })
    .from(itemReviews)
    .where(eq(itemReviews.id, parsed.data.reviewId))
    .limit(1);
  // Nonexistent, or your own: same silent success as a real report.
  if (!review || review.authorId === user.id) return { ok: true as const };

  // One open report per (reporter, review) — re-tapping shouldn't inflate the
  // count the queue sorts by.
  const [existing] = await db
    .select({ id: reports.id })
    .from(reports)
    .where(
      and(
        eq(reports.targetReviewId, review.id),
        eq(reports.reporterUserId, user.id),
      ),
    )
    .limit(1);
  if (existing) return { ok: true as const };

  await db.insert(reports).values({
    reporterUserId: user.id,
    targetUserId: review.authorId,
    targetReviewId: review.id,
    reason: parsed.data.reason,
  });
  return { ok: true as const };
}

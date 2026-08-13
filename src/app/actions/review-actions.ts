"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getCurrentUser } from "@/auth";
import { assertOwnsUserItem, assertUser } from "@/authz";
import { db } from "@/db";
import { itemReviews, reports } from "@/db/schema";
import { getReviewFeedPage } from "@/modules/reviews/queries";
import {
  REVIEW_MAX_LENGTH,
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

/**
 * Links are rejected outright. A 280-character box next to a title people
 * search for is a spam magnet, and the only thing that makes it worth spamming
 * is the ability to leave a URL. Rejecting them removes the payoff instead of
 * relying on a moderator to notice.
 */
const LINK_PATTERNS = [
  /https?:\/\//i,
  /\bwww\./i,
  /\b[a-z0-9-]{2,}\.(com|net|org|io|co|app|me|ly|gg|tv|xyz|link|shop|info|biz)\b/i,
];

const bodySchema = z
  .string()
  .trim()
  .min(1)
  .max(REVIEW_MAX_LENGTH)
  .refine((v) => !LINK_PATTERNS.some((re) => re.test(v)), {
    message: "link",
  });

export type SaveReviewResult =
  | { ok: true }
  | { error: "invalid" | "link" | "locked" | "failed" };

/**
 * Publish or edit the caller's review of a title.
 *
 * Two gates, both server-side (the UI's lock is a courtesy, not the rule):
 * `assertOwnsUserItem` proves the title is in their library, and the reaction
 * check enforces the product rule that writing is UNLOCKED by reacting — a
 * verdict or an obsession, either one.
 *
 * Editing clears `hiddenAt`: a hidden review tells its author "puedes editarla
 * y volver a enviarla", so the edit has to actually re-publish it. The reports
 * that got it hidden stay on file (and stay resolved), so the queue keeps the
 * history and a repeat offender still reads as one.
 */
export async function saveReviewAction(input: {
  catalogItemId: string;
  body: string;
  hasSpoiler: boolean;
}): Promise<SaveReviewResult> {
  const { user, item } = await assertOwnsUserItem(input.catalogItemId);

  // The unlock rule (F3.9): react first — me gusta, no me gusta o me obsesiona.
  if (!item.obsessed && item.verdict === null) return { error: "locked" };

  const body = bodySchema.safeParse(input.body);
  if (!body.success) {
    return {
      error: body.error.issues.some((i) => i.message === "link")
        ? "link"
        : "invalid",
    };
  }
  const hasSpoiler = z.boolean().safeParse(input.hasSpoiler);
  if (!hasSpoiler.success) return { error: "invalid" };

  const now = new Date();
  try {
    await db
      .insert(itemReviews)
      .values({
        userId: user.id,
        catalogItemId: input.catalogItemId,
        body: body.data,
        hasSpoiler: hasSpoiler.data,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [itemReviews.userId, itemReviews.catalogItemId],
        set: {
          body: body.data,
          hasSpoiler: hasSpoiler.data,
          updatedAt: now,
          hiddenAt: null,
          hiddenByUserId: null,
        },
      });
  } catch (err) {
    console.error("[F3.9] save review failed:", err);
    return { error: "failed" };
  }

  revalidatePath(`/item/${input.catalogItemId}`);
  return { ok: true };
}

/** Delete the caller's own review. The ⋯ menu two-tap-confirms before this. */
export async function deleteReviewAction(catalogItemId: string) {
  const { user } = await assertOwnsUserItem(catalogItemId);
  await db
    .delete(itemReviews)
    .where(
      and(
        eq(itemReviews.userId, user.id),
        eq(itemReviews.catalogItemId, catalogItemId),
      ),
    );
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

import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { itemReviews, reports, users } from "@/db/schema";
import type { ProfileReportBody, ReviewReportBody } from "./types";

/**
 * Trust & safety — the two report writes (profile F2.21, review F3.9), shared
 * by the web actions (`report-actions.ts`, `review-actions.ts`) and the API
 * (`POST /api/v1/people/{handle}/report`, `POST /api/v1/reviews/{id}/report`).
 * Both take the reporter's id explicitly (never a "use server" file) and both
 * are SILENT by design: they return nothing, so no caller can tell a real
 * report from a skipped one — the response never confirms that a handle or a
 * review exists, that it was yours, or that you already reported it.
 *
 * Neither is gated on blocks: someone you blocked (or who blocked you) is
 * exactly who you may need to report.
 */

/**
 * Report the PUBLIC profile at `username`. Anonymous reports are allowed
 * (`reporterId` null — the public web page has no session). Skipped without a
 * trace: nonexistent or private handles (the same posture as the rest of the
 * public surface — a private profile can't be seen, so it can't be what you
 * are reporting) and reporting yourself.
 */
export async function reportProfile(
  reporterId: string | null,
  username: string,
  body: ProfileReportBody,
): Promise<void> {
  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(eq(users.username, username.toLowerCase()), eq(users.isPublic, true)),
    )
    .limit(1);
  if (!target || target.id === reporterId) return;

  await db.insert(reports).values({
    reporterUserId: reporterId,
    targetUserId: target.id,
    reason: body.reason,
    details: body.details || null,
  });
}

/**
 * Report someone else's review. Signed-in only (a report with nobody behind it
 * is worth less than the abuse surface it opens). `targetUserId` carries the
 * review's AUTHOR so the moderation queue gets repeat-offender context without
 * a second join. Skipped without a trace: nonexistent review, your own, or one
 * you already reported (one open report per reporter+review — re-tapping must
 * not inflate the count the queue sorts by).
 */
export async function reportReview(
  reporterId: string,
  reviewId: string,
  body: ReviewReportBody,
): Promise<void> {
  const [review] = await db
    .select({ id: itemReviews.id, authorId: itemReviews.userId })
    .from(itemReviews)
    .where(eq(itemReviews.id, reviewId))
    .limit(1);
  if (!review || review.authorId === reporterId) return;

  const [existing] = await db
    .select({ id: reports.id })
    .from(reports)
    .where(
      and(
        eq(reports.targetReviewId, review.id),
        eq(reports.reporterUserId, reporterId),
      ),
    )
    .limit(1);
  if (existing) return;

  await db.insert(reports).values({
    reporterUserId: reporterId,
    targetUserId: review.authorId,
    targetReviewId: review.id,
    reason: body.reason,
  });
}

"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { itemReviews, reports } from "@/db/schema";
import { requireAdmin } from "@/modules/admin/guard";

/**
 * F3.9 — the Torre de Control's FIRST write capability.
 *
 * Until now the portal was strictly read-only cross-user aggregates (AGENTS.md).
 * UGC changed that: a reported review needs someone able to act on it. The
 * capability is deliberately as small as it can be —
 *
 *   - it writes exactly two columns (`item_review.hidden_at` + who did it) and
 *     closes report rows;
 *   - it NEVER edits or deletes another user's text (hiding is reversible from
 *     the same queue, deleting is the author's alone);
 *   - it is gated on `requireAdmin()` (users.isAdmin — the operator role
 *     assigned by hand), never on the isFounder badge.
 *
 * Everything else in /admin stays read-only.
 */

const idSchema = z.string().min(1).max(64);

/** Take a review out of every feed. The author still sees it, with a note. */
export async function hideReviewAction(reviewId: string) {
  const admin = await requireAdmin();
  const parsed = idSchema.safeParse(reviewId);
  if (!parsed.success) return { error: "invalid" as const };

  const now = new Date();
  await db
    .update(itemReviews)
    .set({ hiddenAt: now, hiddenByUserId: admin.id })
    .where(eq(itemReviews.id, parsed.data));

  // Hiding answers every open report on it.
  await db
    .update(reports)
    .set({ resolvedAt: now, resolvedByUserId: admin.id })
    .where(
      and(
        eq(reports.targetReviewId, parsed.data),
        isNull(reports.resolvedAt),
      ),
    );

  revalidatePath("/admin/resenas");
  return { ok: true as const };
}

/** Undo a hide — the review goes back into the feeds, reports stay closed. */
export async function restoreReviewAction(reviewId: string) {
  await requireAdmin();
  const parsed = idSchema.safeParse(reviewId);
  if (!parsed.success) return { error: "invalid" as const };

  await db
    .update(itemReviews)
    .set({ hiddenAt: null, hiddenByUserId: null })
    .where(eq(itemReviews.id, parsed.data));

  revalidatePath("/admin/resenas");
  return { ok: true as const };
}

/**
 * "Descartar" — the report was wrong. Closes every open report on the review
 * and leaves the review exactly where it was. Nothing about it changes.
 */
export async function dismissReviewReportsAction(reviewId: string) {
  const admin = await requireAdmin();
  const parsed = idSchema.safeParse(reviewId);
  if (!parsed.success) return { error: "invalid" as const };

  await db
    .update(reports)
    .set({ resolvedAt: new Date(), resolvedByUserId: admin.id })
    .where(
      and(
        eq(reports.targetReviewId, parsed.data),
        isNull(reports.resolvedAt),
      ),
    );

  revalidatePath("/admin/resenas");
  return { ok: true as const };
}

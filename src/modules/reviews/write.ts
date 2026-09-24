import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { catalogItems, itemReviews, userItems } from "@/db/schema";
import { supportsSpoiler } from "@/modules/reviews/format";
import { REVIEW_MAX_LENGTH } from "@/modules/reviews/types";

/**
 * F3.9 — the ONE write path for a user's own review, shared by the web's
 * `saveReviewAction` / `deleteReviewAction` (review-actions.ts) and the API's
 * `PUT|DELETE /api/v1/me/titles/{id}/review`. Takes a `userId`: never a
 * "use server" file, never imports `next/cache` or `next/navigation` — the
 * action revalidates, the API serializes, this module only writes.
 *
 * Everything here keys on the catalog item and resolves the caller's OWN row;
 * nothing can reach another user's review (moderation lives in
 * review-moderation-actions.ts, admin-gated).
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

/** Trimmed, 1..REVIEW_MAX_LENGTH. The link rule is checked separately
 *  (`hasLink`) so callers can tell "too long" from "has a URL". */
export const reviewBodySchema: z.ZodString = z
  .string()
  .trim()
  .min(1)
  .max(REVIEW_MAX_LENGTH);

export function hasLink(body: string): boolean {
  return LINK_PATTERNS.some((re) => re.test(body));
}

export type SaveReviewError = "invalid" | "link" | "locked" | "not_found";
export type SaveReviewOutcome = { ok: true; id: string } | { error: SaveReviewError };

/**
 * Publish or edit the caller's review of a title.
 *
 * Gates, all server-side (the UI's lock is a courtesy, not the rule):
 *  - `not_found`: the title is not in the user's library (no `user_item`).
 *    Callers that already ran `assertOwnsUserItem` will never see it, but
 *    the module does not trust them to have.
 *  - `locked`: the product rule that writing is UNLOCKED by reacting — a
 *    verdict or an obsession, either one (`!obsessed && verdict === null`).
 *  - `link` / `invalid`: LINK_PATTERNS, then trim + length.
 *
 * Albums have nothing to spoil, so `hasSpoiler` is forced to false on one
 * (`supportsSpoiler`) whatever the caller sent — also normalizes an album
 * review that somehow carried the flag.
 *
 * Editing does NOT touch `hiddenAt` (founder decision, 2026-09-02): a review
 * moderation hid stays hidden however many times its author rewrites it — the
 * only way back into the feed is Restaurar in the Torre. Anything else turns
 * every edit into a free re-publish that skips the queue.
 */
export async function saveReview(
  userId: string,
  catalogItemId: string,
  input: { body: string; hasSpoiler: boolean },
): Promise<SaveReviewOutcome> {
  const [item] = await db
    .select({ obsessed: userItems.obsessed, verdict: userItems.verdict })
    .from(userItems)
    .where(and(eq(userItems.userId, userId), eq(userItems.catalogItemId, catalogItemId)))
    .limit(1);
  if (!item) return { error: "not_found" };

  // The unlock rule (F3.9): react first — me gusta, no me gusta o me obsesiona.
  if (!item.obsessed && item.verdict === null) return { error: "locked" };

  if (typeof input.body === "string" && hasLink(input.body)) return { error: "link" };
  const body = reviewBodySchema.safeParse(input.body);
  if (!body.success) return { error: "invalid" };
  const spoiler = z.boolean().safeParse(input.hasSpoiler);
  if (!spoiler.success) return { error: "invalid" };

  const [catalog] = await db
    .select({ mediaType: catalogItems.mediaType })
    .from(catalogItems)
    .where(eq(catalogItems.id, catalogItemId))
    .limit(1);
  const hasSpoiler = catalog && supportsSpoiler(catalog.mediaType) ? spoiler.data : false;

  const now = new Date();
  const [row] = await db
    .insert(itemReviews)
    .values({
      userId,
      catalogItemId,
      body: body.data,
      hasSpoiler,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [itemReviews.userId, itemReviews.catalogItemId],
      // Deliberately no `hiddenAt` here — see the docblock.
      set: { body: body.data, hasSpoiler, updatedAt: now },
    })
    .returning({ id: itemReviews.id });
  return { ok: true, id: row.id };
}

/**
 * Delete the caller's own review. Idempotent: no row, no error. Also the
 * cleanup the two library removes call, because there is no FK from
 * item_review to user_item to cascade from (independent tables by design) —
 * a review left behind would sit in the public feed for a title its author
 * no longer has.
 */
export async function deleteOwnReview(userId: string, catalogItemId: string): Promise<void> {
  await db
    .delete(itemReviews)
    .where(and(eq(itemReviews.userId, userId), eq(itemReviews.catalogItemId, catalogItemId)));
}

export interface OwnReviewRow {
  id: string;
  body: string;
  hasSpoiler: boolean;
  createdAt: Date;
  updatedAt: Date;
  /** Moderation hid it; its author still reads it (no shadowban). */
  hiddenAt: Date | null;
}

/** The caller's own review of a title, read WITHOUT the public gate and
 *  without filtering `hidden_at` — its author sees it regardless. */
export async function getOwnReview(
  userId: string,
  catalogItemId: string,
): Promise<OwnReviewRow | null> {
  const [row] = await db
    .select({
      id: itemReviews.id,
      body: itemReviews.body,
      hasSpoiler: itemReviews.hasSpoiler,
      createdAt: itemReviews.createdAt,
      updatedAt: itemReviews.updatedAt,
      hiddenAt: itemReviews.hiddenAt,
    })
    .from(itemReviews)
    .where(and(eq(itemReviews.userId, userId), eq(itemReviews.catalogItemId, catalogItemId)))
    .limit(1);
  return row ?? null;
}

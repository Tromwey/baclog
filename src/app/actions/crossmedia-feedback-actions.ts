"use server";

import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { assertOwnsUserItem } from "@/authz";
import { db } from "@/db";
import { crossMediaRecoFeedback } from "@/db/schema";
import { ALL_REASONS } from "@/modules/recs/feedback-reasons";

/**
 * F3.6 — structured "why" feedback on a cross-media-sourced item's reaction.
 * Chips, not free text, so it's aggregable by promptVersion/model without
 * another LLM pass. Only shown/accepted for items with sourceCrossMediaRecId
 * set — organic adds don't get this (they already feed taste signal for free
 * via getLovedSeeds, no extra UI needed). Provenance + feedback are per-TITLE
 * now (F3.7): keyed on the catalog item → the caller's user_item, one live "why"
 * per title.
 *
 * The reason tag lists live in modules/recs/feedback-reasons.ts, NOT here — a
 * "use server" file may only export async functions, so any plain constant
 * exported alongside submitCrossMediaFeedbackAction throws at the client
 * module boundary the moment it's imported (verified against Next's
 * action-validate.js — this WAS a bug in an earlier version of this file).
 */
export async function submitCrossMediaFeedbackAction(
  catalogItemId: string,
  reasons: string[],
): Promise<{ ok: true } | { error: "invalid" | "not_eligible" }> {
  const { item } = await assertOwnsUserItem(catalogItemId);
  if (!item.sourceCrossMediaRecId) return { error: "not_eligible" as const };

  const parsed = z.array(z.enum(ALL_REASONS)).min(1).max(8).safeParse(reasons);
  if (!parsed.success) return { error: "invalid" as const };

  await db
    .insert(crossMediaRecoFeedback)
    .values({
      userItemId: item.id,
      userId: item.userId,
      crossMediaRecId: item.sourceCrossMediaRecId,
      reasons: parsed.data,
    })
    .onConflictDoUpdate({
      target: crossMediaRecoFeedback.userItemId,
      set: { reasons: sql`excluded.reasons`, updatedAt: sql`now()` },
    });

  revalidatePath("/backlogs", "layout");
  return { ok: true as const };
}

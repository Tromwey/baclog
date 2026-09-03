"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { assertOwnsBacklog } from "@/authz";
import { db } from "@/db";
import { backlogItems } from "@/db/schema";
import {
  addItemAction,
  removeMembershipAction,
  setObsessedAction,
  setStatusAction,
  setVerdictAction,
} from "./backlog-item-actions";
import { saveReviewAction, type SaveReviewResult } from "./review-actions";

/**
 * Revamp UI 08 (2026-09-03) — the "Completar" sheet's one write, and the
 * membership toggle of the "En N backlogs" sheet. Both COMPOSE the existing
 * per-field actions rather than touching tables themselves, so every rule
 * those actions enforce (assertOwnsUserItem, the review unlock gate, the
 * album spoiler drop, revalidation) applies unchanged.
 */

const REACTIONS = ["disliked", "liked", "obsessed"] as const;
export type CompleteReaction = (typeof REACTIONS)[number] | null;

const completeSchema = z.object({
  catalogItemId: z.string().min(1).max(64),
  reaction: z.enum(REACTIONS).nullable(),
  body: z.string().max(2000),
  hasSpoiler: z.boolean(),
});

export type CompleteResult =
  | { ok: true }
  | { error: "invalid" | "link" | "locked" | "failed" };

/**
 * Publicar: status → completed, then the chosen reaction, then the review if
 * there is one. The sheet's three choices map onto the two independent axes
 * (F3.7): "No me gustó" and "Me gustó" set the verdict AND clear the
 * obsession (a verdict picked here is the whole answer); "Obsesión" sets the
 * flag and leaves the verdict alone. No choice leaves both as they were.
 *
 * Each step is its own action call, so the title needs to be in the library
 * already (the sheet adds it first) and a failure midway leaves the earlier
 * steps applied — completion without a review is a valid end state.
 */
export async function completeItemAction(input: {
  catalogItemId: string;
  reaction: CompleteReaction;
  body: string;
  hasSpoiler: boolean;
}): Promise<CompleteResult> {
  const parsed = completeSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid" };
  const { catalogItemId, reaction, body, hasSpoiler } = parsed.data;

  try {
    const status = await setStatusAction(catalogItemId, "completed");
    if ("error" in status) return { error: "failed" };

    if (reaction === "obsessed") {
      await setObsessedAction(catalogItemId, true);
    } else if (reaction !== null) {
      await setVerdictAction(catalogItemId, reaction);
      await setObsessedAction(catalogItemId, false);
    }
  } catch (err) {
    console.error("[08] complete failed:", err);
    return { error: "failed" };
  }

  if (body.trim().length === 0) return { ok: true };
  const saved: SaveReviewResult = await saveReviewAction({
    catalogItemId,
    body,
    hasSpoiler,
  });
  return saved;
}

/**
 * The "En N backlogs" sheet: put the title in a backlog, or take it out of
 * one. Adding is `addItemAction` verbatim; removing resolves the caller's own
 * membership row for that backlog and hands it to `removeMembershipAction`,
 * which GC's the per-title state (and the review) when it was the last one.
 */
export async function setMembershipAction(input: {
  backlogId: string;
  catalogItemId: string;
  member: boolean;
  paletteHex?: string[];
}) {
  const parsed = z
    .object({
      backlogId: z.string().min(1).max(64),
      catalogItemId: z.string().min(1).max(64),
      member: z.boolean(),
    })
    .safeParse(input);
  if (!parsed.success) return { error: "invalid" as const };
  const { backlogId, catalogItemId, member } = parsed.data;

  if (member) {
    const res = await addItemAction({
      backlogId,
      catalogItemId,
      paletteHex: input.paletteHex,
    });
    return "id" in res ? { ok: true as const } : res;
  }

  const { user } = await assertOwnsBacklog(backlogId);
  const [membership] = await db
    .select({ id: backlogItems.id })
    .from(backlogItems)
    .where(
      and(
        eq(backlogItems.backlogId, backlogId),
        eq(backlogItems.userId, user.id),
        eq(backlogItems.catalogItemId, catalogItemId),
      ),
    )
    .limit(1);
  if (!membership) return { ok: true as const };
  return removeMembershipAction(membership.id);
}

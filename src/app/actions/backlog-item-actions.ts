"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { assertOwnsBacklog, assertOwnsBacklogItem } from "@/authz";
import { db } from "@/db";
import { backlogItems, itemStatusEnum } from "@/db/schema";
import { paletteHexSchema } from "@/modules/backlog/palette";

type ItemStatus = (typeof itemStatusEnum.enumValues)[number];

const paletteSchema = paletteHexSchema.optional();

export async function addItemAction(input: {
  backlogId: string;
  catalogItemId: string;
  paletteHex?: string[];
}) {
  const { user, backlog } = await assertOwnsBacklog(input.backlogId);
  const palette = paletteSchema.safeParse(input.paletteHex);
  if (!palette.success) return { error: "invalid" as const };

  const [row] = await db
    .insert(backlogItems)
    .values({
      backlogId: backlog.id,
      userId: user.id,
      catalogItemId: input.catalogItemId,
      paletteHex: palette.data ?? null,
    })
    .onConflictDoNothing({
      target: [backlogItems.backlogId, backlogItems.catalogItemId],
    })
    .returning({ id: backlogItems.id });

  // "layout" over the /backlogs segment: one call covers the shelf list, both
  // zoom twins ([backlogId] + the intercepted @modal) and the lenses — they
  // all render this item's state.
  revalidatePath("/backlogs", "layout");
  if (row) return { id: row.id };

  // Already in this backlog — return the EXISTING row's id so the caller can
  // still mark it as added / allow removal (the Descubrir search toggle relies
  // on this; an opaque "duplicate" left the ＋ stuck and un-undoable).
  const [existing] = await db
    .select({ id: backlogItems.id })
    .from(backlogItems)
    .where(
      and(
        eq(backlogItems.backlogId, backlog.id),
        eq(backlogItems.catalogItemId, input.catalogItemId),
      ),
    )
    .limit(1);
  return existing ? { id: existing.id } : { error: "invalid" as const };
}

const STATUSES: ItemStatus[] = [
  "on_my_radar",
  "in_progress",
  "completed",
  "custom",
];

export async function setStatusAction(
  backlogItemId: string,
  status: ItemStatus,
  customLabel?: string,
) {
  const { item } = await assertOwnsBacklogItem(backlogItemId);
  if (!STATUSES.includes(status)) return { error: "invalid" as const };
  const label =
    status === "custom"
      ? z.string().trim().min(1).max(30).safeParse(customLabel)
      : null;
  if (label && !label.success) return { error: "invalid" as const };

  await db
    .update(backlogItems)
    .set({
      status,
      customStatusLabel: label ? label.data : null,
      statusChangedAt: new Date(),
    })
    .where(eq(backlogItems.id, item.id));
  revalidatePath("/backlogs", "layout");
  return { ok: true as const };
}

const REACTIONS = ["disliked", "liked", "obsessed"] as const;
export type ItemReaction = (typeof REACTIONS)[number];

/**
 * No me gusta / me gusta / me obsesiona (F3.6) — applies regardless of the
 * item's status (obsession can strike mid-consumption, not just on completion).
 */
export async function setReactionAction(
  backlogItemId: string,
  reaction: ItemReaction,
) {
  const { item } = await assertOwnsBacklogItem(backlogItemId);
  const parsed = z.enum(REACTIONS).safeParse(reaction);
  if (!parsed.success) return { error: "invalid" as const };
  await db
    .update(backlogItems)
    .set({ reaction: parsed.data, reactionChangedAt: new Date() })
    .where(eq(backlogItems.id, item.id));
  revalidatePath("/backlogs", "layout");
  return { ok: true as const };
}

/**
 * Quitar la reacción (detail ⋯ menu) — back to "sin reacción". Stamps
 * reactionChangedAt like setReactionAction so consumers can discount flapping.
 */
export async function clearReactionAction(backlogItemId: string) {
  const { item } = await assertOwnsBacklogItem(backlogItemId);
  await db
    .update(backlogItems)
    .set({ reaction: null, reactionChangedAt: new Date() })
    .where(eq(backlogItems.id, item.id));
  revalidatePath("/backlogs", "layout");
  return { ok: true as const };
}

/**
 * "Ocultar recomendación" (detail ⋯ menu) — drops the AI-provenance link so
 * the row stops showing the ✦ destello and the detail stops rendering the
 * "¿Por qué?" narrative. One-way by design: the rec id isn't recoverable.
 */
export async function hideRecoProvenanceAction(backlogItemId: string) {
  const { item } = await assertOwnsBacklogItem(backlogItemId);
  await db
    .update(backlogItems)
    .set({ sourceCrossMediaRecId: null })
    .where(eq(backlogItems.id, item.id));
  revalidatePath("/backlogs", "layout");
  return { ok: true as const };
}

export async function removeItemAction(backlogItemId: string) {
  const { item } = await assertOwnsBacklogItem(backlogItemId);
  await db.delete(backlogItems).where(eq(backlogItems.id, item.id));
  revalidatePath("/backlogs", "layout");
  return { ok: true as const };
}

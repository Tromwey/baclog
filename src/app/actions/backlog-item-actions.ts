"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { assertOwnsBacklog, assertOwnsBacklogItem } from "@/authz";
import { db } from "@/db";
import { backlogItems, itemStatusEnum } from "@/db/schema";

type ItemStatus = (typeof itemStatusEnum.enumValues)[number];

const paletteSchema = z
  .array(z.string().regex(/^#[0-9a-fA-F]{6}$/))
  .max(6)
  .optional();

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

  revalidatePath(`/backlogs/${backlog.id}`);
  return row ? { id: row.id } : { error: "duplicate" as const };
}

const STATUSES: ItemStatus[] = [
  "on_my_radar",
  "obsessing_over",
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
      // Rating only makes sense on completed items
      ...(status !== "completed" ? { rating: null } : {}),
      statusChangedAt: new Date(),
    })
    .where(eq(backlogItems.id, item.id));
  revalidatePath(`/backlogs/${item.backlogId}`);
  return { ok: true as const };
}

export async function setRatingAction(backlogItemId: string, rating: number) {
  const { item } = await assertOwnsBacklogItem(backlogItemId);
  const parsed = z.number().int().min(1).max(5).safeParse(rating);
  if (!parsed.success || item.status !== "completed") {
    return { error: "invalid" as const };
  }
  await db
    .update(backlogItems)
    .set({ rating: parsed.data })
    .where(eq(backlogItems.id, item.id));
  revalidatePath(`/backlogs/${item.backlogId}`);
  return { ok: true as const };
}

export async function removeItemAction(backlogItemId: string) {
  const { item } = await assertOwnsBacklogItem(backlogItemId);
  await db.delete(backlogItems).where(eq(backlogItems.id, item.id));
  revalidatePath(`/backlogs/${item.backlogId}`);
  return { ok: true as const };
}

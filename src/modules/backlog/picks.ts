import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { backlogs, userItems } from "@/db/schema";
import { backfillPreorderDate } from "@/modules/catalog/preorder";
import { ensureUserItemAndMembership } from "./membership";
import { paletteHexSchema } from "./palette";

/** The first backlog every account gets, born from its three picks. */
export const FIRST_BACKLOG = {
  name: "Obsesiones",
  vibe: "Lo que me consume ahora",
} as const;

export const picksSchema = z
  .array(
    z.object({
      catalogItemId: z.string().trim().min(1).max(64),
      paletteHex: paletteHexSchema.optional(),
    }),
  )
  .min(1)
  .max(3);

export type Pick = z.infer<typeof picksSchema>[number];

async function createFirstBacklog(userId: string): Promise<string> {
  const [created] = await db
    .insert(backlogs)
    .values({ userId, ...FIRST_BACKLOG })
    .returning({ id: backlogs.id });
  return created!.id;
}

/**
 * Onboarding step 2 — "Elige tres" (Revamp UI, 2026-09-03), shared by the
 * web action (`completePicksAction`) and `POST /me/onboarding/picks`. The
 * picks ARE obsessions: each one lands as a membership of the account's first
 * backlog ("Obsesiones") plus its per-title state row with `obsessed = true`.
 * The palette arrives cover-extracted on-device (like Descubrir's add) and is
 * written to the shared catalog cache only where it's still empty.
 *
 * Re-entry (a reload mid-flow, or an account that already has a backlog):
 * no second "Obsesiones" — the picks join the NEWEST existing backlog, and a
 * title already in the library keeps its state (ensureUserItemAndMembership
 * never resets an existing user_item; the obsession flag is only set where
 * it's still off, so `obsessedAt` isn't restamped either).
 *
 * Callers validate with `picksSchema` first and make sure every
 * `catalogItemId` exists (the FK would otherwise fail mid-loop).
 */
export async function completePicks(
  userId: string,
  picks: Pick[],
): Promise<{ backlogId: string }> {
  // Two taps on the same title can't become two adds.
  const unique = new Map(picks.map((p) => [p.catalogItemId, p]));

  const [newest] = await db
    .select({ id: backlogs.id })
    .from(backlogs)
    .where(eq(backlogs.userId, userId))
    .orderBy(desc(backlogs.createdAt))
    .limit(1);

  const backlogId: string = newest?.id ?? (await createFirstBacklog(userId));

  const now = new Date();
  for (const pick of unique.values()) {
    await ensureUserItemAndMembership({
      userId,
      backlogId,
      catalogItemId: pick.catalogItemId,
      paletteHex: pick.paletteHex ?? null,
    });
    await db
      .update(userItems)
      .set({ obsessed: true, obsessedAt: now })
      .where(
        and(
          eq(userItems.userId, userId),
          eq(userItems.catalogItemId, pick.catalogItemId),
          eq(userItems.obsessed, false),
        ),
      );
    await backfillPreorderDate(pick.catalogItemId);
  }

  return { backlogId };
}

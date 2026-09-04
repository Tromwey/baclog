"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { assertUser } from "@/authz";
import { db } from "@/db";
import { backlogs, preferredServiceEnum, userItems, users } from "@/db/schema";
import { ensureUserItemAndMembership } from "@/modules/backlog/membership";
import { paletteHexSchema } from "@/modules/backlog/palette";
import { cacheReleaseDate, getCatalogItem } from "@/modules/catalog/cache";
import { getAlbumDetail } from "@/modules/catalog/itunes";

/** The first backlog every account gets, born from its three picks. */
const FIRST_BACKLOG = {
  name: "Obsesiones",
  vibe: "Lo que me consume ahora",
} as const;

const picksSchema = z
  .array(
    z.object({
      catalogItemId: z.string().trim().min(1).max(64),
      paletteHex: paletteHexSchema.optional(),
    }),
  )
  .min(1)
  .max(3);

/**
 * F3.8 — same best-effort pre-order date resolution addItemAction does on add
 * (backlog-item-actions.ts): gated on `year IS NULL`, the pre-order signature.
 * A searched pick can be an unreleased album; a pool pick never is, and the
 * lookup skips itself for every released title. Never fails the add.
 */
async function backfillPreorderDate(catalogItemId: string): Promise<void> {
  try {
    const item = await getCatalogItem(catalogItemId);
    if (
      !item ||
      item.source !== "itunes" ||
      item.mediaType !== "album" ||
      item.year !== null ||
      item.releaseDate !== null
    ) {
      return;
    }
    const detail = await getAlbumDetail(item.externalId);
    await cacheReleaseDate(catalogItemId, detail.releaseDate, null);
  } catch (err) {
    console.error("[F3.8] pre-order date backfill failed:", err);
  }
}

async function createFirstBacklog(userId: string): Promise<string> {
  const [created] = await db
    .insert(backlogs)
    .values({ userId, ...FIRST_BACKLOG })
    .returning({ id: backlogs.id });
  return created!.id;
}

/**
 * Onboarding step 2 — "Elige tres" (Revamp UI, 2026-09-03). The picks ARE
 * obsessions: each one lands as a membership of the account's first backlog
 * ("Obsesiones") plus its per-title state row with `obsessed = true`. The
 * palette arrives cover-extracted on-device (like Descubrir's add) and is
 * written to the shared catalog cache only where it's still empty.
 *
 * Re-entry (a reload mid-flow, or an account that already has a backlog):
 * no second "Obsesiones" — the picks join the NEWEST existing backlog, and a
 * title already in the library keeps its state (ensureUserItemAndMembership
 * never resets an existing user_item; the obsession flag is only set where
 * it's still off, so `obsessedAt` isn't restamped either).
 */
export async function completePicksAction(
  picks: { catalogItemId: string; paletteHex?: string[] }[],
) {
  const user = await assertUser();
  const parsed = picksSchema.safeParse(picks);
  if (!parsed.success) return { error: "invalid" as const };

  // Two taps on the same title can't become two adds.
  const unique = new Map(parsed.data.map((p) => [p.catalogItemId, p]));

  const [newest] = await db
    .select({ id: backlogs.id })
    .from(backlogs)
    .where(eq(backlogs.userId, user.id))
    .orderBy(desc(backlogs.createdAt))
    .limit(1);

  const backlogId: string =
    newest?.id ?? (await createFirstBacklog(user.id));

  const now = new Date();
  for (const pick of unique.values()) {
    await ensureUserItemAndMembership({
      userId: user.id,
      backlogId,
      catalogItemId: pick.catalogItemId,
      paletteHex: pick.paletteHex ?? null,
    });
    await db
      .update(userItems)
      .set({ obsessed: true, obsessedAt: now })
      .where(
        and(
          eq(userItems.userId, user.id),
          eq(userItems.catalogItemId, pick.catalogItemId),
          eq(userItems.obsessed, false),
        ),
      );
    await backfillPreorderDate(pick.catalogItemId);
  }

  // "layout" over /backlogs: the shelf list, both zoom twins and the lenses.
  revalidatePath("/backlogs", "layout");
  return { ok: true as const, backlogId };
}

const serviceSchema = z.enum(preferredServiceEnum.enumValues);

/**
 * Onboarding's terminal step (3 · servicio preferido, v2 2026-09-03): saves
 * the music service every album will open in, then finishes. Server-side
 * redirect on purpose — a client router.push here can replay the stale
 * "/backlogs → /onboarding" redirect cached before onboarding completed. The
 * (app) layout re-gates on `user.name`, so an account that never finished
 * step 1 simply lands back here. Same posture as Ajustes'
 * `setPreferredServiceAction`: the user comes from the session, the service
 * from the enum.
 */
export async function chooseServiceAndFinishAction(service: string) {
  const user = await assertUser();
  const parsed = serviceSchema.safeParse(service);
  if (!parsed.success) return { error: "invalid" as const };
  await db
    .update(users)
    .set({ preferredService: parsed.data })
    .where(eq(users.id, user.id));
  redirect("/backlogs");
}

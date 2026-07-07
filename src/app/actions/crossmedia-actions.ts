"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { assertUser } from "@/authz";
import { db } from "@/db";
import { backlogItems, backlogs } from "@/db/schema";
import {
  generateNextUncachedReco,
  type DiscoverResult,
} from "@/modules/recs/crossmedia";

/**
 * F3.5.5 acceptance flow (recomendaciones-multimedia.md — "¿a qué backlog va
 * la reco?").
 *
 * Default = the backlog where the SEED lives (keeps the Double Feature pair
 * together, least-surprising destination). Fallbacks, in order:
 *   1. seed in several backlogs → the most recently touched one
 *   2. seed not in any backlog (global view) → catch-all "Descubrimientos"
 *   3. user has no backlogs at all → create "Descubrimientos" and use it
 *
 * AUTHZ (ADR-010): every mutation verifies ownership app-layer via assertUser +
 * userId-scoped queries. The reco target is a real catalog_item (grounded), so
 * adding it is the same trusted insert as the existing add-to-backlog picker.
 */

const DISCOVERIES = "Descubrimientos";

export interface AcceptResult {
  backlogId: string;
  backlogName: string;
}

/**
 * Resolve the default target backlog for a reco given its seed, WITHOUT
 * mutating anything. Used to preselect the picker ("Cambiar") and to label the
 * toast before the user commits. May create "Descubrimientos" only via accept,
 * never here — so returns null when the user has no backlogs yet.
 */
export async function defaultBacklogForSeed(seedCatalogItemId: string): Promise<
  { backlogId: string; backlogName: string } | null
> {
  const user = await assertUser();

  // Where does the seed live? Most recently touched wins.
  const [seedHome] = await db
    .select({ backlogId: backlogItems.backlogId, name: backlogs.name })
    .from(backlogItems)
    .innerJoin(backlogs, eq(backlogItems.backlogId, backlogs.id))
    .where(
      and(
        eq(backlogItems.userId, user.id),
        eq(backlogItems.catalogItemId, seedCatalogItemId),
      ),
    )
    .orderBy(desc(backlogItems.statusChangedAt))
    .limit(1);
  if (seedHome) return { backlogId: seedHome.backlogId, backlogName: seedHome.name };

  // Seed not in a backlog (global view) → an existing "Descubrimientos", if any.
  const [discoveries] = await db
    .select({ id: backlogs.id, name: backlogs.name })
    .from(backlogs)
    .where(and(eq(backlogs.userId, user.id), eq(backlogs.name, DISCOVERIES)))
    .limit(1);
  if (discoveries) return { backlogId: discoveries.id, backlogName: discoveries.name };

  return null;
}

/**
 * Accept (＋) a cross-media reco. Adds the grounded target catalog_item to the
 * default backlog (see defaultBacklogForSeed), creating "Descubrimientos" only
 * as the last-resort fallback. Idempotent on the per-backlog unique index.
 */
export async function acceptRecoAction(input: {
  seedCatalogItemId: string;
  targetCatalogItemId: string;
  paletteHex?: string[];
}): Promise<AcceptResult | { error: "invalid" }> {
  const user = await assertUser();

  const target = await resolveTargetBacklog(user.id, input.seedCatalogItemId);

  await db
    .insert(backlogItems)
    .values({
      backlogId: target.backlogId,
      userId: user.id,
      catalogItemId: input.targetCatalogItemId,
      paletteHex:
        input.paletteHex && input.paletteHex.length > 0
          ? input.paletteHex.slice(0, 6)
          : null,
    })
    .onConflictDoNothing({
      target: [backlogItems.backlogId, backlogItems.catalogItemId],
    });

  revalidatePath(`/backlogs/${target.backlogId}`);
  return target;
}

/**
 * "Cambiar" override: add the reco to a specific backlog the user picked (or a
 * newly-created one). Ownership is enforced on the chosen backlog.
 */
export async function acceptRecoToBacklogAction(input: {
  backlogId: string;
  targetCatalogItemId: string;
  paletteHex?: string[];
}): Promise<AcceptResult | { error: "invalid" | "not_found" }> {
  const user = await assertUser();

  const [backlog] = await db
    .select({ id: backlogs.id, name: backlogs.name })
    .from(backlogs)
    .where(and(eq(backlogs.id, input.backlogId), eq(backlogs.userId, user.id)))
    .limit(1);
  if (!backlog) return { error: "not_found" };

  await db
    .insert(backlogItems)
    .values({
      backlogId: backlog.id,
      userId: user.id,
      catalogItemId: input.targetCatalogItemId,
      paletteHex:
        input.paletteHex && input.paletteHex.length > 0
          ? input.paletteHex.slice(0, 6)
          : null,
    })
    .onConflictDoNothing({
      target: [backlogItems.backlogId, backlogItems.catalogItemId],
    });

  revalidatePath(`/backlogs/${backlog.id}`);
  return { backlogId: backlog.id, backlogName: backlog.name };
}

/**
 * F3.5.6 — "descubre otra conexión" on /para-ti. Generates ONE new pairing for
 * the next uncached loved seed (the engine enforces the monthly cap + grounding),
 * then revalidates so the feed re-reads cache-first (no extra generation on the
 * refresh). AUTHZ: assertUser gates it; the engine only ever sees item metadata
 * (Pilar 4) and the userId for the meter — never sent to the LLM.
 */
export async function discoverNextRecoAction(): Promise<{
  result: DiscoverResult;
}> {
  const user = await assertUser();
  let result: DiscoverResult;
  try {
    result = await generateNextUncachedReco(user.id);
  } catch (err) {
    // F3.5.5 tables absent / transient failure → degrade, never throw to the UI.
    console.error("[crossmedia] discover next failed:", err);
    result = "failed";
  }
  revalidatePath("/para-ti");
  return { result };
}

/** Default target, creating "Descubrimientos" as the terminal fallback. */
async function resolveTargetBacklog(
  userId: string,
  seedCatalogItemId: string,
): Promise<AcceptResult> {
  const preset = await defaultBacklogForSeed(seedCatalogItemId);
  if (preset) return preset;

  // No home + no existing "Descubrimientos" → create it (mixed-media, no type).
  const [created] = await db
    .insert(backlogs)
    .values({ userId, name: DISCOVERIES })
    .returning({ id: backlogs.id, name: backlogs.name });
  revalidatePath("/backlogs");
  return { backlogId: created.id, backlogName: created.name };
}

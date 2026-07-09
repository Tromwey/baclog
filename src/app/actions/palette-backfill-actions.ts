"use server";

import { revalidatePath } from "next/cache";
import { eq, isNotNull } from "drizzle-orm";
import { requireUser } from "@/auth";
import { db } from "@/db";
import { backlogItems, catalogItems } from "@/db/schema";
import { paletteHexSchema } from "@/modules/backlog/palette";

/**
 * F3.6.1 — maintenance backfill: re-extract backlog items' paletteHex with
 * the vividness-scored algorithm (palette.ts). Not strictly one-off — this is
 * the second time the extraction ranking has changed (frequency → vividness),
 * so this tool is meant to be re-run again whenever the algorithm improves,
 * not deleted after a single use. extractPalette is browser-only
 * (canvas/Image), so this can't run as a server script — a founder-gated
 * admin page drives it client-side, one item at a time, and persists each
 * result here.
 *
 * Founder-gated, NOT ownership-scoped — a SECOND deliberate exception to the
 * app-layer ownership rule alongside getPublicProfile (AGENTS.md's authz
 * section names both). This writes OTHER users' backlogItems.paletteHex, kept
 * to that single cosmetic column; no other field is touched.
 */
export interface PaletteBackfillTarget {
  backlogItemId: string;
  posterUrl: string;
}

export async function getPaletteBackfillTargetsAction(): Promise<
  PaletteBackfillTarget[] | { error: "forbidden" }
> {
  const user = await requireUser();
  if (!user.isFounder) return { error: "forbidden" };

  const rows = await db
    .select({
      backlogItemId: backlogItems.id,
      posterUrl: catalogItems.posterUrl,
    })
    .from(backlogItems)
    .innerJoin(catalogItems, eq(backlogItems.catalogItemId, catalogItems.id))
    .where(isNotNull(catalogItems.posterUrl));

  return rows
    .filter((r): r is { backlogItemId: string; posterUrl: string } =>
      Boolean(r.posterUrl),
    )
    .map((r) => ({ backlogItemId: r.backlogItemId, posterUrl: r.posterUrl }));
}

export async function updateItemPaletteAction(
  backlogItemId: string,
  paletteHex: string[],
): Promise<{ ok: true } | { error: "forbidden" | "invalid" | "not_found" }> {
  const user = await requireUser();
  if (!user.isFounder) return { error: "forbidden" };

  const parsed = paletteHexSchema.safeParse(paletteHex);
  if (!parsed.success) return { error: "invalid" as const };

  const updated = await db
    .update(backlogItems)
    .set({ paletteHex: parsed.data.length > 0 ? parsed.data : null })
    .where(eq(backlogItems.id, backlogItemId))
    .returning({ id: backlogItems.id });
  if (updated.length === 0) return { error: "not_found" as const };

  revalidatePath("/backlogs");
  revalidatePath("/perfil");
  return { ok: true as const };
}

"use server";

import { revalidatePath } from "next/cache";
import { eq, isNotNull } from "drizzle-orm";
import { requireUser } from "@/auth";
import { db } from "@/db";
import { catalogItems } from "@/db/schema";
import { paletteHexSchema } from "@/modules/backlog/palette";

/**
 * F3.6.1 — maintenance backfill: re-extract each title's paletteHex with the
 * vividness-scored algorithm (palette.ts). Not strictly one-off — this is the
 * second time the extraction ranking has changed (frequency → vividness), so
 * this tool is meant to be re-run whenever the algorithm improves, not deleted
 * after a single use. extractPalette is browser-only (canvas/Image), so this
 * can't run as a server script — a founder-gated admin page drives it
 * client-side, one item at a time, and persists each result here.
 *
 * Palette is per-TITLE (cover-derived) and lives on the shared catalog cache, so
 * targets are catalog_item rows (one per title), not per-copy. ADMIN-gated
 * (users.isAdmin — the operator role, NOT the isFounder badge that the whole
 * first-100 cohort carries), NOT ownership-scoped — a deliberate exception to
 * the app-layer ownership rule alongside getPublicProfile (AGENTS.md's authz
 * section names them). Writes only catalog_item.paletteHex (shared cache,
 * cosmetic).
 */
export interface PaletteBackfillTarget {
  catalogItemId: string;
  posterUrl: string;
}

export async function getPaletteBackfillTargetsAction(): Promise<
  PaletteBackfillTarget[] | { error: "forbidden" }
> {
  const user = await requireUser();
  if (!user.isAdmin) return { error: "forbidden" };

  const rows = await db
    .select({
      catalogItemId: catalogItems.id,
      posterUrl: catalogItems.posterUrl,
    })
    .from(catalogItems)
    .where(isNotNull(catalogItems.posterUrl));

  return rows
    .filter((r): r is { catalogItemId: string; posterUrl: string } =>
      Boolean(r.posterUrl),
    )
    .map((r) => ({ catalogItemId: r.catalogItemId, posterUrl: r.posterUrl }));
}

export async function updateItemPaletteAction(
  catalogItemId: string,
  paletteHex: string[],
): Promise<{ ok: true } | { error: "forbidden" | "invalid" | "not_found" }> {
  const user = await requireUser();
  if (!user.isAdmin) return { error: "forbidden" };

  const parsed = paletteHexSchema.safeParse(paletteHex);
  if (!parsed.success) return { error: "invalid" as const };

  const updated = await db
    .update(catalogItems)
    .set({ paletteHex: parsed.data.length > 0 ? parsed.data : null })
    .where(eq(catalogItems.id, catalogItemId))
    .returning({ id: catalogItems.id });
  if (updated.length === 0) return { error: "not_found" as const };

  revalidatePath("/backlogs");
  revalidatePath("/perfil");
  return { ok: true as const };
}

"use server";

import { and, eq, isNull } from "drizzle-orm";
import { getCurrentUser } from "@/auth";
import { db } from "@/db";
import { catalogItems } from "@/db/schema";
import { paletteHexSchema } from "@/modules/backlog/palette";

/**
 * F2.15 follow-up — self-healing palette cache. When a signed-in user's
 * on-device extraction produces a palette for a title whose shared catalog row
 * has none yet, persist it so the next viewer (and the public shared page)
 * reads it instead of re-extracting. Same on-device + hex-only posture as the
 * add-to-backlog write (ADR-008 / ADR-007 "never proxy images"): this just lets
 * a VIEW fill the shared cache, not only a save. Server never touches artwork.
 *
 * Guards, in order:
 *  - AUTH: signed-in users only. Anonymous → silent no-op, so there is no
 *    unauthenticated write surface (the public page displays but never writes).
 *  - VALIDATION: strict #RRGGBB × ≤6 (paletteHexSchema); empty ([]) is dropped,
 *    so a CORS/decode failure never persists a bad value.
 *  - isNull: first-writer-wins — only fills an empty row, never clobbers an
 *    existing palette (bounds abuse to "first valid palette per title", and the
 *    field is cosmetic, shared, non-PII).
 *
 * No revalidatePath: the current viewer already sees the extracted colors
 * client-side; this is a background cache fill for everyone else.
 */
export async function cacheItemPaletteAction(
  catalogItemId: string,
  paletteHex: string[],
): Promise<{ ok: true } | { skipped: true }> {
  const user = await getCurrentUser();
  if (!user) return { skipped: true };

  const parsed = paletteHexSchema.safeParse(paletteHex);
  if (!parsed.success || parsed.data.length === 0) return { skipped: true };

  await db
    .update(catalogItems)
    .set({ paletteHex: parsed.data })
    .where(
      and(
        eq(catalogItems.id, catalogItemId),
        isNull(catalogItems.paletteHex),
      ),
    );

  return { ok: true };
}

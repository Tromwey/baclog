"use server";

import { revalidatePath } from "next/cache";
import { assertUser } from "@/authz";
import { db } from "@/db";
import { backlogItems } from "@/db/schema";
import { resolveOrCreateDefaultBacklog } from "@/modules/backlog/default-target";

/**
 * Add a catalog item straight to the user's default backlog — the one-tap ＋
 * on a Descubrir SEARCH result, which (unlike a reco) has no seed to anchor a
 * target. Mirrors acceptRecoAction's trusted insert, but resolves the backlog
 * generically (resolveOrCreateDefaultBacklog).
 *
 * AUTHZ (ADR-010): assertUser derives identity server-side; the client only
 * supplies which catalog item to add (a grounded row) + its on-device palette.
 */
export async function addToDefaultBacklogAction(input: {
  catalogItemId: string;
  paletteHex?: string[];
}): Promise<{ backlogId: string; backlogName: string } | { error: "invalid" }> {
  const user = await assertUser();
  if (!input.catalogItemId) return { error: "invalid" };

  const target = await resolveOrCreateDefaultBacklog(user.id);

  await db
    .insert(backlogItems)
    .values({
      backlogId: target.backlogId,
      userId: user.id,
      catalogItemId: input.catalogItemId,
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

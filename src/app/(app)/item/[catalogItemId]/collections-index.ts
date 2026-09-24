import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { backlogItems, catalogItems } from "@/db/schema";

/**
 * What the ficha's "guardar en" sheet needs beyond the collection names
 * (§patrones · guardar: "Guardar abre siempre la hoja «guardar en» con la
 * última colección usada marcada"): which collection the viewer filed a title
 * into LAST, and the newest cover of each collection for the row thumbnail.
 *
 * OWN-USER ONLY: `userId` is always the session's id, passed by the page —
 * never something the client sent (same posture as descubrir/library-index.ts,
 * which answers the same question for Descubrir). One indexed read on
 * `backlog_item.user_id`, DISTINCT ON the collection so a big library costs one
 * row per collection, not one per title.
 */
export interface CollectionThumb {
  posterUrl: string | null;
  paletteHex: string[] | null;
}

export interface CollectionsIndex {
  lastUsedBacklogId: string | null;
  thumbs: Record<string, CollectionThumb>;
}

export async function getCollectionsIndex(userId: string): Promise<CollectionsIndex> {
  const rows = await db
    .selectDistinctOn([backlogItems.backlogId], {
      backlogId: backlogItems.backlogId,
      addedAt: backlogItems.addedAt,
      posterUrl: catalogItems.posterUrl,
      paletteHex: catalogItems.paletteHex,
    })
    .from(backlogItems)
    .innerJoin(catalogItems, eq(catalogItems.id, backlogItems.catalogItemId))
    .where(eq(backlogItems.userId, userId))
    .orderBy(backlogItems.backlogId, desc(backlogItems.addedAt));

  let last: { id: string; at: number } | null = null;
  const thumbs: Record<string, CollectionThumb> = {};
  for (const r of rows) {
    thumbs[r.backlogId] = { posterUrl: r.posterUrl, paletteHex: r.paletteHex };
    const at = r.addedAt.getTime();
    if (!last || at > last.at) last = { id: r.backlogId, at };
  }
  return { lastUsedBacklogId: last?.id ?? null, thumbs };
}

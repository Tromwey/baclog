import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { backlogItems } from "@/db/schema";
import { getCollectionFans, type CollectionFan } from "@/modules/backlog/shelves";
import { notPartyBacklog } from "@/modules/party-collections/gate";

/**
 * What the ficha's "guardar en" sheet needs beyond the collection names
 * (§patrones · guardar: "Guardar abre siempre la hoja «guardar en» con la
 * última colección usada marcada"): which collection the viewer filed a title
 * into LAST, and each collection's mini fan and count for its row
 * (Colecciones formalizado · 7a).
 *
 * OWN-USER ONLY: `userId` is always the session's id, passed by the page —
 * never something the client sent (same posture as descubrir/library-index.ts,
 * which answers the same question for Descubrir).
 */
export interface CollectionsIndex {
  lastUsedBacklogId: string | null;
  fans: Record<string, CollectionFan>;
}

export async function getCollectionsIndex(userId: string): Promise<CollectionsIndex> {
  const [[last], fans] = await Promise.all([
    db
      .select({ backlogId: backlogItems.backlogId })
      .from(backlogItems)
      // A party (colecciones de fiesta) is never the "last used" collection.
      .where(and(eq(backlogItems.userId, userId), notPartyBacklog(backlogItems.backlogId)))
      .orderBy(desc(backlogItems.addedAt))
      .limit(1),
    getCollectionFans(userId),
  ]);
  return { lastUsedBacklogId: last?.backlogId ?? null, fans };
}

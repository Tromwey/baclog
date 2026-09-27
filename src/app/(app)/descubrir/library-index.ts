import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { backlogItems } from "@/db/schema";
import { getCollectionFans } from "@/modules/backlog/shelves";
import type { LibraryIndex } from "./library";

/**
 * The caller's memberships, indexed for Descubrir's "guardar" (see
 * `library.ts`). OWN-USER ONLY: `userId` is always the session's id, passed by
 * the page — never something the client sent. One indexed read on
 * `backlog_item.user_id` for the memberships, plus each collection's fan
 * (`getCollectionFans`, same scope). Membership + catalog data only; no
 * per-title state crosses here.
 */
export async function getLibraryIndex(userId: string): Promise<LibraryIndex> {
  const [rows, fans] = await Promise.all([
    db
      .select({
        backlogItemId: backlogItems.id,
        backlogId: backlogItems.backlogId,
        catalogItemId: backlogItems.catalogItemId,
      })
      .from(backlogItems)
      .where(eq(backlogItems.userId, userId))
      .orderBy(desc(backlogItems.addedAt)),
    getCollectionFans(userId),
  ]);

  const index: LibraryIndex = {
    byTitle: {},
    fans,
    lastUsedBacklogId: rows[0]?.backlogId ?? null,
  };
  for (const r of rows) {
    (index.byTitle[r.catalogItemId] ??= []).push({
      backlogId: r.backlogId,
      backlogItemId: r.backlogItemId,
    });
  }
  return index;
}

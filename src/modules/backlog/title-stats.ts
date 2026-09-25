import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { backlogItems, userItems } from "@/db/schema";
import type { MediaType } from "@/modules/catalog/types";

/**
 * "En Baclog" (Revamp UI screens 06b/d/f, 2026-09-03): how many people a
 * title obsesses and how many completed it.
 *
 * DELIBERATE CROSS-USER AGGREGATE — the same posture as the Torre de Control
 * metrics: a bare count over `user_item` for ONE catalog item, across every
 * account, public or private. Nothing identifying leaves this module (no user
 * id, no handle, no per-user field, no ordering that could be replayed into
 * one), which is what makes a count acceptable where a list would not be. It
 * renders on the anonymous public item page, so it runs with no session and
 * takes no viewer input beyond the catalog id in the URL.
 */
export interface TitleStats {
  obsessed: number;
  completed: number;
  /** Verdict "me gusta" (independent of completion and obsession). */
  liked: number;
  /** People with the title in at least one collection (distinct, not memberships). */
  saved: number;
}

export async function getTitleStats(catalogItemId: string): Promise<TitleStats> {
  const [row] = await db
    .select({
      obsessed: sql<number>`(count(*) filter (where ${userItems.obsessed}))::int`,
      completed: sql<number>`(count(*) filter (where ${userItems.status} = 'completed'))::int`,
      liked: sql<number>`(count(*) filter (where ${userItems.verdict} = 'liked'))::int`,
      // A title can be marked from its ficha without being saved (a user_item with no
      // membership), so "guardado" counts distinct people in backlog_item instead.
      saved: sql<number>`(select count(distinct ${backlogItems.userId}) from ${backlogItems} where ${backlogItems.catalogItemId} = ${catalogItemId})::int`,
    })
    .from(userItems)
    .where(eq(userItems.catalogItemId, catalogItemId));
  return {
    obsessed: row?.obsessed ?? 0,
    completed: row?.completed ?? 0,
    liked: row?.liked ?? 0,
    saved: row?.saved ?? 0,
  };
}

/** The mock's thousands: "1.240" (a dot, never a comma). */
export function formatThousands(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * The serif sentence under the label: "A 1.240 personas les obsesiona. 3.900
 * la completaron." — singular forms for exactly one, the object pronoun by
 * kind (LA película/serie, LO álbum). Null when nobody has done either, so
 * the block hides instead of saying "A 0 personas".
 */
export function titleStatsSentence(
  { obsessed, completed }: TitleStats,
  mediaType: MediaType,
): string | null {
  if (obsessed === 0 && completed === 0) return null;
  const parts: string[] = [];
  if (obsessed > 0) {
    parts.push(
      obsessed === 1
        ? "A 1 persona le obsesiona."
        : `A ${formatThousands(obsessed)} personas les obsesiona.`,
    );
  }
  if (completed > 0) {
    const it = mediaType === "album" ? "lo" : "la";
    parts.push(
      completed === 1
        ? `1 persona ${it} completó.`
        : `${formatThousands(completed)} ${it} completaron.`,
    );
  }
  return parts.join(" ");
}

import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { backlogItems, backlogs } from "@/db/schema";

/**
 * Default backlog resolution for adds WITHOUT a seed pairing (e.g. a plain
 * search result in Descubrir). The seed-aware version lives in
 * crossmedia-actions (defaultBacklogForSeed); this is its seedless sibling.
 *
 * SECURITY (ADR-010): this is a plain server-only helper, NEVER exported from a
 * "use server" file. It takes userId as a parameter, so it must not be remotely
 * invocable — its callers are Server Actions that derive the user via
 * assertUser() and pass user.id in. Keeping it out of the action boundary is
 * what preserves that invariant.
 */

/** The catch-all backlog name for adds with no natural home. Single source of
 * truth — crossmedia-actions imports this so the two accept paths never diverge
 * (a rename in one place would otherwise orphan the other's "Descubrimientos"). */
export const DISCOVERIES = "Descubrimientos";

export interface DefaultBacklogTarget {
  backlogId: string;
  backlogName: string;
}

/**
 * Best default target, without creating anything:
 *   1. the user's most-recently-touched backlog (via its newest item),
 *   2. else their newest backlog (has backlogs but no items yet),
 *   3. else null — caller decides whether to create "Descubrimientos".
 */
export async function resolveDefaultBacklog(
  userId: string,
): Promise<DefaultBacklogTarget | null> {
  const [recent] = await db
    .select({ backlogId: backlogItems.backlogId, name: backlogs.name })
    .from(backlogItems)
    .innerJoin(backlogs, eq(backlogItems.backlogId, backlogs.id))
    .where(eq(backlogItems.userId, userId))
    .orderBy(desc(backlogItems.statusChangedAt))
    .limit(1);
  if (recent) return { backlogId: recent.backlogId, backlogName: recent.name };

  const [newest] = await db
    .select({ id: backlogs.id, name: backlogs.name })
    .from(backlogs)
    .where(eq(backlogs.userId, userId))
    .orderBy(desc(backlogs.createdAt))
    .limit(1);
  if (newest) return { backlogId: newest.id, backlogName: newest.name };

  return null;
}

/** Same, but creates the catch-all "Descubrimientos" as the terminal fallback. */
export async function resolveOrCreateDefaultBacklog(
  userId: string,
): Promise<DefaultBacklogTarget> {
  const existing = await resolveDefaultBacklog(userId);
  if (existing) return existing;

  const [created] = await db
    .insert(backlogs)
    .values({ userId, name: DISCOVERIES })
    .returning({ id: backlogs.id, name: backlogs.name });
  return { backlogId: created.id, backlogName: created.name };
}

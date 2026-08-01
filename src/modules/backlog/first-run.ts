import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { userItems } from "@/db/schema";
import { LOVED_FILTER } from "./queries";

/**
 * Welcome onboarding — the guided first run (crear backlog → agregar ítem →
 * reaccionar).
 *
 * The step is DERIVED from data the app already owns; nothing is persisted.
 * That buys three things for free: it survives reloads and devices, it matches
 * the activation funnel the Torre de Control already measures (Registro → Crea
 * backlog → Agrega ítem), and it self-heals — delete your only title and the
 * step-2 guidance comes back, which is correct, not a bug.
 *
 * There is no "dismiss" and no override: the guide is a layer that lifts itself
 * the moment the underlying fact changes. Step 0 = activated, no surface shows
 * anything.
 */
export type FirstRunStep = 0 | 1 | 2 | 3;

export interface FirstRunCounts {
  /** Titles in the library (user_item rows — per-title, not per membership). */
  items: number;
  /** Titles the user LOVES (LOVED_FILTER) — what unlocks the reco engine. */
  loved: number;
}

/**
 * The step the user is on. `backlogs` is passed in because every caller already
 * holds it (the shelf list, or the mere fact of standing inside a backlog).
 *
 * Order matters: each step is the FIRST unmet precondition of the next one.
 */
export function firstRunStep(counts: {
  backlogs: number;
  items: number;
  loved: number;
}): FirstRunStep {
  if (counts.backlogs === 0) return 1;
  if (counts.items === 0) return 2;
  if (counts.loved === 0) return 3;
  return 0;
}

/**
 * Both first-run counts in ONE round trip. `loved` reuses LOVED_FILTER inside a
 * FILTER clause rather than re-spelling "obsessed or liked" — that predicate is
 * centralized in queries.ts so every "amado" read agrees, and this is just
 * another one of those reads.
 */
export async function getFirstRunCounts(
  userId: string,
): Promise<FirstRunCounts> {
  const [row] = await db
    .select({
      items: sql<number>`count(*)`.mapWith(Number),
      loved: sql<number>`count(*) filter (where ${LOVED_FILTER})`.mapWith(
        Number,
      ),
    })
    .from(userItems)
    .where(eq(userItems.userId, userId));

  return { items: row?.items ?? 0, loved: row?.loved ?? 0 };
}

/**
 * Just the loved count, for callers that already know `items > 0` because the
 * page they're rendering couldn't exist otherwise (the item detail of a logged
 * title). Same predicate, one column.
 */
export async function countLovedItems(userId: string): Promise<number> {
  const [row] = await db
    .select({
      loved: sql<number>`count(*) filter (where ${LOVED_FILTER})`.mapWith(
        Number,
      ),
    })
    .from(userItems)
    .where(eq(userItems.userId, userId));

  return row?.loved ?? 0;
}

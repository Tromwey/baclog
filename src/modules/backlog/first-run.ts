import { eq, isNotNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { userItems } from "@/db/schema";
import { LOVED_FILTER } from "./queries";
import type { FirstRunCounts } from "./first-run-coach";

/**
 * First-run coach marks — the three moments where the app explains the
 * interface once, and then shuts up.
 *
 * v1 (2026-08-01) was a guided "crear backlog → agregar ítem → reaccionar"
 * with a step meter. Onboarding v2 (2026-09-03) made that impossible to see:
 * "elige tres" creates the first backlog, adds three titles and marks them
 * obsessed, so every new account arrives already activated and the meter
 * never rendered. v2 does those three steps FOR the user; what's left to
 * teach is the interface itself (the "+" chip, the state glyphs, the
 * reaction row + Completar sheet).
 *
 * Every moment is DERIVED from data the app already owns; nothing is
 * persisted. Same posture as v1: it survives reloads and devices, there is
 * no "dismiss" and no override, and each note lifts itself the instant the
 * underlying fact changes (complete one title → the glyph legend is gone).
 */

export {
  ONBOARDING_PICKS,
  firstRunCoach,
  type FirstRunCoach,
  type FirstRunCounts,
} from "./first-run-coach";

const COMPLETED_FILTER = eq(userItems.status, "completed");
const JUDGED_FILTER = or(isNotNull(userItems.verdict), COMPLETED_FILTER);

/**
 * All first-run counts in ONE round trip. `loved` reuses LOVED_FILTER inside
 * a FILTER clause rather than re-spelling "obsessed or liked" — that
 * predicate is centralized in queries.ts so every "amado" read agrees, and
 * this is just another one of those reads.
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
      completed: sql<number>`count(*) filter (where ${COMPLETED_FILTER})`.mapWith(
        Number,
      ),
      judged: sql<number>`count(*) filter (where ${JUDGED_FILTER})`.mapWith(
        Number,
      ),
    })
    .from(userItems)
    .where(eq(userItems.userId, userId));

  return {
    items: row?.items ?? 0,
    loved: row?.loved ?? 0,
    completed: row?.completed ?? 0,
    judged: row?.judged ?? 0,
  };
}

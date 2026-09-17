import { eq, isNotNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { userItems } from "@/db/schema";
import { LOVED_FILTER } from "./queries";

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

/** How many titles onboarding v2 plants (mirrors picksSchema `.max(3)`). */
export const ONBOARDING_PICKS = 3;

export interface FirstRunCounts {
  /** Titles in the library (user_item rows — per-title, not per membership). */
  items: number;
  /** Titles the user LOVES (LOVED_FILTER) — what feeds the reco engine. */
  loved: number;
  /** Titles marked completed. */
  completed: number;
  /**
   * Reactions onboarding could NOT have planted: a verdict (me gustó / no me
   * gustó) or a completion. Obsession alone doesn't count — v2 sets it on the
   * picks, so it says nothing about whether the user has touched the row.
   */
  judged: number;
}

export interface FirstRunCoach {
  /**
   * Backlogs list — the library is still just the onboarding picks (a few
   * titles, all loved, none judged). Explains the "+" chip and that the
   * picks already light Discover.
   */
  shelves: boolean;
  /** Backlog detail — nothing completed yet. Explains the state glyphs. */
  grid: boolean;
  /**
   * Item detail — no own reaction yet. Explains the reaction row and that
   * "Completo" opens the review sheet.
   */
  item: boolean;
}

export function firstRunCoach(c: FirstRunCounts): FirstRunCoach {
  return {
    shelves:
      c.items > 0 &&
      c.items <= ONBOARDING_PICKS &&
      c.loved === c.items &&
      c.judged === 0,
    grid: c.completed === 0,
    item: c.judged === 0,
  };
}

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

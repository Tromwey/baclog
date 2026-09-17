/**
 * The pure half of first-run.ts: which coach note shows for which library
 * counts. Kept DB-free so `scripts/check-first-run.ts` can assert it without
 * pulling `@/db` (which is `server-only`).
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

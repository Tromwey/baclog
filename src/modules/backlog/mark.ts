/**
 * The Kura "mark" — the user's reaction to a title as ONE value, derived from
 * the three `user_item` columns (`obsessed`, `verdict`, `status`). Pure module
 * (no "server-only", no DB) on purpose: the API serializers, the smoke script
 * and the wire check all import it under tsx.
 *
 * Precedence obsessed → liked → completed, the same order `markOf` in
 * modules/reviews/queries.ts uses; the one difference is that `completed`
 * exists here (a completion without a verdict) because the app's picker has
 * that third state, while a review card never shows "just completed".
 */

export type KuraMark = "obsessed" | "liked" | "completed";

export interface MarkInput {
  obsessed: boolean;
  verdict: string | null;
  status: string;
}

/** What the CALLER sees of their own reaction. `null` = saved, nothing else. */
export function kuraMarkOf(row: MarkInput): KuraMark | null {
  if (row.obsessed) return "obsessed";
  if (row.verdict === "liked") return "liked";
  if (row.status === "completed") return "completed";
  return null;
}

export type PublicMark = KuraMark | "disliked";

/** A reaction as SEEN BY OTHERS (feed, reviews): adds `disliked`, which the
 *  app renders only inside the author's own review. */
export function publicMarkOf(row: MarkInput): PublicMark | null {
  if (row.obsessed) return "obsessed";
  if (row.verdict === "liked" || row.verdict === "disliked") return row.verdict;
  if (row.status === "completed") return "completed";
  return null;
}

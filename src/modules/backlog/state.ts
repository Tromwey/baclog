import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { catalogItems, itemReviews, userItems } from "@/db/schema";
import { isUpcoming } from "@/modules/catalog/release";
import type { KuraMark } from "./mark";

/**
 * The Kura "mark" as ONE write (API v1 `PUT /me/titles/{id}/mark`, ios/API.md
 * §4). The web keeps its per-field actions (status / verdict / obsession —
 * `backlog-item-actions.ts`) and composes them in `completeItemAction`; this
 * module is the same semantics collapsed into a single UPDATE on the caller's
 * `user_item`, keyed on the catalog item (state is per-TITLE, never on the
 * membership — AGENTS.md).
 *
 *   obsessed  → status=completed · obsessed=true (+obsessedAt) · verdict UNTOUCHED
 *               (the web rule: obsession and verdict are independent axes)
 *   liked     → status=completed · verdict=liked (+verdictChangedAt) · obsessed=false
 *   completed → status=completed · verdict=null · obsessed=false
 *   null      → status=on_my_radar · verdict=null · obsessed=false
 *
 * Timestamps move only when their value changes, so a repeated PUT (the app
 * retries) neither re-stamps `obsessedAt` (a feed event instant) nor bumps
 * `statusChangedAt` (the recap era bucket).
 *
 * Release rule (F3.8): a mark on a title whose `releaseDate` is still ahead
 * is refused with `not_released` unless the caller says `preview` ("La vi en
 * preestreno"). On the web this rule only lived in the UI (the action bar is
 * hidden while upcoming); here it is enforced.
 */

export type SetMarkResult = { ok: true } | { error: "not_found" | "not_released" };

export async function setMark(
  userId: string,
  catalogItemId: string,
  mark: KuraMark | null,
  opts: { preview?: boolean; now?: Date } = {},
): Promise<SetMarkResult> {
  const now = opts.now ?? new Date();

  const [row] = await db
    .select({
      id: userItems.id,
      status: userItems.status,
      verdict: userItems.verdict,
      obsessed: userItems.obsessed,
      releaseDate: catalogItems.releaseDate,
    })
    .from(userItems)
    .innerJoin(catalogItems, eq(userItems.catalogItemId, catalogItems.id))
    .where(and(eq(userItems.userId, userId), eq(userItems.catalogItemId, catalogItemId)))
    .limit(1);
  if (!row) return { error: "not_found" };

  if (mark !== null && !opts.preview && isUpcoming(row.releaseDate, now.getTime())) {
    return { error: "not_released" };
  }

  const patch: Partial<typeof userItems.$inferInsert> = {};

  const status = mark === null ? "on_my_radar" : "completed";
  if (row.status !== status) {
    patch.status = status;
    patch.statusChangedAt = now;
  }

  if (mark === "obsessed") {
    if (!row.obsessed) {
      patch.obsessed = true;
      patch.obsessedAt = now;
    }
  } else if (row.obsessed) {
    patch.obsessed = false;
    patch.obsessedAt = null;
  }

  if (mark === "liked") {
    if (row.verdict !== "liked") {
      patch.verdict = "liked";
      patch.verdictChangedAt = now;
    }
  } else if (mark !== "obsessed" && row.verdict !== null) {
    patch.verdict = null;
    patch.verdictChangedAt = now;
  }

  if (Object.keys(patch).length > 0) {
    await db
      .update(userItems)
      .set(patch)
      .where(and(eq(userItems.id, row.id), eq(userItems.userId, userId)));
  }
  return { ok: true };
}

/**
 * The caller's own per-title state, in the shape `toTitleState` (api/v1 wire)
 * takes: `user_item` columns + their `item_review.id` (LEFT join — one review
 * per user+title; `hidden_at` not filtered, the author keeps seeing it). Null
 * when the title isn't in their library. Own-user read only.
 */
export async function getOwnTitleState(userId: string, catalogItemId: string) {
  const [row] = await db
    .select({
      catalogItemId: userItems.catalogItemId,
      status: userItems.status,
      verdict: userItems.verdict,
      obsessed: userItems.obsessed,
      addedAt: userItems.addedAt,
      reviewId: itemReviews.id,
    })
    .from(userItems)
    .leftJoin(
      itemReviews,
      and(
        eq(itemReviews.userId, userItems.userId),
        eq(itemReviews.catalogItemId, userItems.catalogItemId),
      ),
    )
    .where(and(eq(userItems.userId, userId), eq(userItems.catalogItemId, catalogItemId)))
    .limit(1);
  return row ?? null;
}

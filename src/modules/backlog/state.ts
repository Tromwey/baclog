import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { catalogItems, itemReviews, userItems } from "@/db/schema";
import { getCatalogItem } from "@/modules/catalog/cache";
import { backfillPreorderDate } from "@/modules/catalog/preorder";
import { isUpcoming } from "@/modules/catalog/release";
import type { KuraMark } from "./mark";

/**
 * The Kura "mark" as ONE write (API v1 `PUT /me/titles/{id}/mark`, ios/API.md
 * §4). The web keeps its per-field actions (status / verdict / obsession —
 * `backlog-item-actions.ts`) and composes them in `completeItemAction`; this
 * module is a single UPDATE on the caller's `user_item`, keyed on the catalog
 * item (state is per-TITLE, never on the membership — AGENTS.md). NOT the
 * same semantics as the web's per-field writes: a mark is one picker state,
 * so `completed` (and `null`) CLEAR the verdict and the obsession, where the
 * web's `setStatusAction` leaves both axes alone. What the two share is the
 * timestamp rule below.
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
 *
 * Mark WITHOUT saving (phase 4b, founder 2026-09-24): a non-null mark on a
 * catalog title the caller has no `user_item` for CREATES that row — per-title
 * state with NO membership in any collection (the same shape a title has after
 * its collection is deleted); the app offers "guardar en" afterwards. Order:
 * unknown catalog id → `not_found`; the release rule runs BEFORE the insert
 * (a 409 creates nothing); then `INSERT … ON CONFLICT DO NOTHING` + re-read,
 * so two racing PUTs converge on one row. `mark: null` on a title with no
 * `user_item` is `not_found`, NOT a no-op: "quitar la marca" of something
 * that isn't in the library must never create a row. The web actions don't
 * go through here and still require a saved title. `removeTitleFromLibrary`
 * (DELETE /me/titles/{id}) removes such a row like any other.
 */

export type SetMarkResult = { ok: true } | { error: "not_found" | "not_released" };

export async function setMark(
  userId: string,
  catalogItemId: string,
  mark: KuraMark | null,
  opts: { preview?: boolean; now?: Date } = {},
): Promise<SetMarkResult> {
  const now = opts.now ?? new Date();

  let row = await readMarkRow(userId, catalogItemId);
  if (!row) {
    // Nothing to clear on a title that isn't in the library.
    if (mark === null) return { error: "not_found" };
    const created = await createUnsavedState(userId, catalogItemId, now, opts.preview ?? false);
    if ("error" in created) return created;
    row = created.row;
  }

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

async function readMarkRow(userId: string, catalogItemId: string) {
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
  return row ?? null;
}

/**
 * The "mark without saving" half of `setMark`: the bare `user_item` (default
 * state = on the radar; `setMark` then applies the mark like on any saved
 * title), no `backlog_item`. The pre-order backfill runs first — it's the ONE
 * copy every path that puts a title into a library shares (catalog/preorder.ts),
 * and a pre-order album only learns its date there, so skipping it would let
 * a mark through the release rule on an album that isn't out yet.
 */
async function createUnsavedState(
  userId: string,
  catalogItemId: string,
  now: Date,
  preview: boolean,
): Promise<
  | { row: NonNullable<Awaited<ReturnType<typeof readMarkRow>>> }
  | { error: "not_found" | "not_released" }
> {
  const item = await getCatalogItem(catalogItemId);
  if (!item) return { error: "not_found" };

  let releaseDate = item.releaseDate;
  if (releaseDate === null) {
    await backfillPreorderDate(catalogItemId);
    releaseDate = (await getCatalogItem(catalogItemId))?.releaseDate ?? null;
  }
  if (!preview && isUpcoming(releaseDate, now.getTime())) return { error: "not_released" };

  await db
    .insert(userItems)
    .values({ userId, catalogItemId, addedAt: now, statusChangedAt: now })
    .onConflictDoNothing({ target: [userItems.userId, userItems.catalogItemId] });
  const row = await readMarkRow(userId, catalogItemId);
  if (!row) {
    // ON CONFLICT DO NOTHING means the row exists unless something deleted
    // it between the two statements — say so loudly, never a silent 404.
    throw new Error(
      `user_item missing right after upsert (userId=${userId}, catalogItemId=${catalogItemId})`,
    );
  }
  return { row };
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

"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  assertOwnsBacklog,
  assertOwnsBacklogItem,
  assertOwnsUserItem,
} from "@/authz";
import { db } from "@/db";
import {
  backlogItems,
  itemReviews,
  itemStatusEnum,
  userItems,
} from "@/db/schema";
import { paletteHexSchema } from "@/modules/backlog/palette";
import { ensureUserItemAndMembership } from "@/modules/backlog/membership";
import { cacheReleaseDate, getCatalogItem } from "@/modules/catalog/cache";
import { getAlbumDetail } from "@/modules/catalog/itunes";

type ItemStatus = (typeof itemStatusEnum.enumValues)[number];

const paletteSchema = paletteHexSchema.optional();

/**
 * F3.8 — resolve a pre-order's release date at add time.
 *
 * Gated on `year IS NULL`, which is the pre-order signature and nothing else:
 * iTunes' album search index doesn't carry unreleased titles at all, and the
 * song rows that DO surface them (the song→album fold in itunes.ts) carry no
 * releaseDate, so a pre-order is the only album that lands in the catalog
 * without a year. Every already-released album skips the lookup entirely.
 *
 * Best-effort by construction: adding a title must never fail because Apple
 * was slow. Worst case the date arrives later, on the first view of the item.
 */
async function backfillPreorderDate(catalogItemId: string): Promise<void> {
  try {
    const item = await getCatalogItem(catalogItemId);
    if (
      !item ||
      item.source !== "itunes" ||
      item.mediaType !== "album" ||
      item.year !== null ||
      item.releaseDate !== null
    ) {
      return;
    }
    const detail = await getAlbumDetail(item.externalId);
    await cacheReleaseDate(catalogItemId, detail.releaseDate, null);
  } catch (err) {
    console.error("[F3.8] pre-order date backfill failed:", err);
  }
}

export async function addItemAction(input: {
  backlogId: string;
  catalogItemId: string;
  paletteHex?: string[];
}) {
  const { user, backlog } = await assertOwnsBacklog(input.backlogId);
  const palette = paletteSchema.safeParse(input.paletteHex);
  if (!palette.success) return { error: "invalid" as const };

  const { membershipId } = await ensureUserItemAndMembership({
    userId: user.id,
    backlogId: backlog.id,
    catalogItemId: input.catalogItemId,
    paletteHex: palette.data ?? null,
  });

  await backfillPreorderDate(input.catalogItemId);

  // "layout" over the /backlogs segment: one call covers the shelf list, both
  // zoom twins ([backlogId] + the intercepted @modal) and the lenses.
  revalidatePath("/backlogs", "layout");
  // Return the membership id (new OR pre-existing) so the caller can still mark
  // it as added / allow removal (the Descubrir search toggle relies on this).
  return membershipId ? { id: membershipId } : { error: "invalid" as const };
}

// F2.8 custom status is retired (item-flow redesign): only the three real
// progress states are settable. The enum still carries 'custom' (removing a
// value needs a type rebuild — not worth it), so it's simply absent here.
const STATUSES: ItemStatus[] = ["on_my_radar", "in_progress", "completed"];

/**
 * Status / verdict / obsession / provenance are per-TITLE now (F3.7 followup):
 * every mutation below is keyed on the catalog item and resolves the caller's
 * single user_item, so the change is the same across every backlog the title is
 * filed under. `assertOwnsUserItem` is the authz choke point.
 */
export async function setStatusAction(catalogItemId: string, status: ItemStatus) {
  const { item } = await assertOwnsUserItem(catalogItemId);
  if (!STATUSES.includes(status)) return { error: "invalid" as const };

  await db
    .update(userItems)
    .set({ status, statusChangedAt: new Date() })
    .where(eq(userItems.id, item.id));
  revalidatePath("/backlogs", "layout");
  return { ok: true as const };
}

const VERDICTS = ["disliked", "liked"] as const;
export type ItemVerdict = (typeof VERDICTS)[number];

/**
 * Veredicto — me gusta / no me gusta (F3.7). An INDEPENDENT axis from obsession:
 * setting a verdict never touches the obsession flag. Applies in any status; the
 * public-exposure gate lives in the query (public.ts), not here.
 */
export async function setVerdictAction(
  catalogItemId: string,
  verdict: ItemVerdict,
) {
  const { item } = await assertOwnsUserItem(catalogItemId);
  const parsed = z.enum(VERDICTS).safeParse(verdict);
  if (!parsed.success) return { error: "invalid" as const };
  await db
    .update(userItems)
    .set({ verdict: parsed.data, verdictChangedAt: new Date() })
    .where(eq(userItems.id, item.id));
  revalidatePath("/backlogs", "layout");
  return { ok: true as const };
}

/** Quitar el veredicto (re-tap in the ⋯ menu) — back to "sin veredicto". */
export async function clearVerdictAction(catalogItemId: string) {
  const { item } = await assertOwnsUserItem(catalogItemId);
  await db
    .update(userItems)
    .set({ verdict: null, verdictChangedAt: new Date() })
    .where(eq(userItems.id, item.id));
  revalidatePath("/backlogs", "layout");
  return { ok: true as const };
}

/**
 * Obsesión — me obsesiona (F3.7), the prominent detail gesture. `obsessedAt` is
 * stamped when set true and nulled when unset ("obsessedAt is null iff not
 * obsessed").
 */
export async function setObsessedAction(
  catalogItemId: string,
  obsessed: boolean,
) {
  const { item } = await assertOwnsUserItem(catalogItemId);
  const parsed = z.boolean().safeParse(obsessed);
  if (!parsed.success) return { error: "invalid" as const };
  await db
    .update(userItems)
    .set({
      obsessed: parsed.data,
      obsessedAt: parsed.data ? new Date() : null,
    })
    .where(eq(userItems.id, item.id));
  revalidatePath("/backlogs", "layout");
  return { ok: true as const };
}

/**
 * F3.9 — a review belongs to a title the user KEEPS. There is no FK from
 * item_review to user_item to cascade from (they're independent tables by
 * design), so the two removes that GC the per-title state clean it up here,
 * explicitly. Leaving it behind would keep a review in the public feed for a
 * title its author no longer has, with a reaction glyph read off a row that
 * no longer exists.
 */
async function deleteOwnReview(userId: string, catalogItemId: string) {
  await db
    .delete(itemReviews)
    .where(
      and(
        eq(itemReviews.userId, userId),
        eq(itemReviews.catalogItemId, catalogItemId),
      ),
    );
}

/**
 * Quitar de ESTE backlog — deletes one membership (by its backlog_item id).
 * If it was the title's last membership, GC the per-title state (user_item),
 * which cascades its reco feedback. This is the per-backlog remove the shelf row
 * and the Descubrir toggle use.
 */
export async function removeMembershipAction(backlogItemId: string) {
  const { user, item } = await assertOwnsBacklogItem(backlogItemId);
  await db.delete(backlogItems).where(eq(backlogItems.id, item.id));

  const [remaining] = await db
    .select({ id: backlogItems.id })
    .from(backlogItems)
    .where(
      and(
        eq(backlogItems.userId, user.id),
        eq(backlogItems.catalogItemId, item.catalogItemId),
      ),
    )
    .limit(1);
  if (!remaining) {
    await db
      .delete(userItems)
      .where(
        and(
          eq(userItems.userId, user.id),
          eq(userItems.catalogItemId, item.catalogItemId),
        ),
      );
    await deleteOwnReview(user.id, item.catalogItemId);
  }

  revalidatePath("/backlogs", "layout");
  return { ok: true as const };
}

/**
 * Quitar de mi biblioteca (detail ⋯ menu) — removes the title from EVERY backlog
 * and deletes the per-title state. The detail view is per-title, so this is the
 * unambiguous "remove entirely"; per-backlog removal lives on the shelf row.
 */
export async function removeFromLibraryAction(catalogItemId: string) {
  const { user } = await assertOwnsUserItem(catalogItemId);
  await db
    .delete(backlogItems)
    .where(
      and(
        eq(backlogItems.userId, user.id),
        eq(backlogItems.catalogItemId, catalogItemId),
      ),
    );
  await db
    .delete(userItems)
    .where(
      and(
        eq(userItems.userId, user.id),
        eq(userItems.catalogItemId, catalogItemId),
      ),
    );
  await deleteOwnReview(user.id, catalogItemId);
  revalidatePath("/backlogs", "layout");
  return { ok: true as const };
}

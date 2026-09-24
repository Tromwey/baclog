"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNotNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import {
  assertOwnsBacklog,
  assertOwnsBacklogItem,
  assertOwnsUserItem,
} from "@/authz";
import { db } from "@/db";
import { itemStatusEnum, userItems } from "@/db/schema";
import { paletteHexSchema } from "@/modules/backlog/palette";
import {
  addTitleToBacklog,
  removeTitleFromBacklog,
  removeTitleFromLibrary,
} from "@/modules/backlog/membership";

type ItemStatus = (typeof itemStatusEnum.enumValues)[number];

const paletteSchema = paletteHexSchema.optional();

export type AddItemResult =
  | { id: string }
  | { error: "invalid" | "backlog_not_found" | "title_not_found" };

/**
 * Membership add — `modules/backlog/membership.ts` (`addTitleToBacklog`) does
 * the work (palette → user_item → membership → F3.8 pre-order backfill); this
 * wrapper only asserts ownership and revalidates. The module's error travels
 * AS IS (`title_not_found` ≠ a bad palette), and nothing is revalidated on a
 * failed add — there is nothing new to show.
 */
export async function addItemAction(input: {
  backlogId: string;
  catalogItemId: string;
  paletteHex?: string[];
}): Promise<AddItemResult> {
  const { user, backlog } = await assertOwnsBacklog(input.backlogId);
  const palette = paletteSchema.safeParse(input.paletteHex);
  if (!palette.success) return { error: "invalid" as const };

  const res = await addTitleToBacklog(
    user.id,
    backlog.id,
    input.catalogItemId,
    palette.data ?? null,
  );
  if (!res.ok) return { error: res.error };

  // "layout" over the /backlogs segment: one call covers the shelf list, both
  // zoom twins ([backlogId] + the intercepted @modal) and the lenses.
  revalidatePath("/backlogs", "layout");
  // Return the membership id (new OR pre-existing) so the caller can still mark
  // it as added / allow removal (the Descubrir search toggle relies on this).
  return { id: res.membershipId };
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
 *
 * Each `*ChangedAt` / `obsessedAt` moves ONLY when its value changes — the
 * "no change" guard is in the WHERE, same as `completePicks` and the API's
 * `setMark`: `obsessedAt` is a feed-event instant and `statusChangedAt` the
 * recap's era bucket, and a re-tap on the same state must not move either.
 */
export async function setStatusAction(catalogItemId: string, status: ItemStatus) {
  const { item } = await assertOwnsUserItem(catalogItemId);
  if (!STATUSES.includes(status)) return { error: "invalid" as const };

  await db
    .update(userItems)
    .set({ status, statusChangedAt: new Date() })
    .where(and(eq(userItems.id, item.id), ne(userItems.status, status)));
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
    // `is distinct from`: a plain `<>` is NULL (no match) when there is no
    // verdict yet, and that first set MUST land.
    .where(
      and(
        eq(userItems.id, item.id),
        sql`${userItems.verdict} is distinct from ${parsed.data}`,
      ),
    );
  revalidatePath("/backlogs", "layout");
  return { ok: true as const };
}

/** Quitar el veredicto (re-tap in the ⋯ menu) — back to "sin veredicto". */
export async function clearVerdictAction(catalogItemId: string) {
  const { item } = await assertOwnsUserItem(catalogItemId);
  await db
    .update(userItems)
    .set({ verdict: null, verdictChangedAt: new Date() })
    .where(and(eq(userItems.id, item.id), isNotNull(userItems.verdict)));
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
    .where(and(eq(userItems.id, item.id), ne(userItems.obsessed, parsed.data)));
  revalidatePath("/backlogs", "layout");
  return { ok: true as const };
}

/**
 * Quitar de ESTE backlog — deletes one membership (by its backlog_item id).
 * If it was the title's last membership, the module GC's the per-title state
 * (user_item, which cascades its reco feedback) and the review — see
 * `removeTitleFromBacklog`. This is the per-backlog remove the shelf row and
 * the Descubrir toggle use.
 */
export async function removeMembershipAction(backlogItemId: string) {
  const { user, item } = await assertOwnsBacklogItem(backlogItemId);
  await removeTitleFromBacklog(user.id, item.backlogId, item.catalogItemId);
  revalidatePath("/backlogs", "layout");
  return { ok: true as const };
}

/**
 * Quitar de mi biblioteca (detail ⋯ menu) — removes the title from EVERY backlog
 * and deletes the per-title state (+ the review). The detail view is per-title,
 * so this is the unambiguous "remove entirely"; per-backlog removal lives on
 * the shelf row.
 */
export async function removeFromLibraryAction(catalogItemId: string) {
  const { user } = await assertOwnsUserItem(catalogItemId);
  await removeTitleFromLibrary(user.id, catalogItemId);
  revalidatePath("/backlogs", "layout");
  return { ok: true as const };
}

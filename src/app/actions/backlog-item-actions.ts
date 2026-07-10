"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  assertOwnsBacklog,
  assertOwnsBacklogItem,
  assertOwnsUserItem,
} from "@/authz";
import { db } from "@/db";
import { backlogItems, catalogItems, itemStatusEnum, userItems } from "@/db/schema";
import { paletteHexSchema } from "@/modules/backlog/palette";

type ItemStatus = (typeof itemStatusEnum.enumValues)[number];

const paletteSchema = paletteHexSchema.optional();

/**
 * The one place a title enters a user's world: ensure the shared cover palette,
 * the per-title state row (user_item), and the per-backlog membership all exist.
 * Shared by addItemAction and the cross-media accept flow so both keep the three
 * levels consistent (membership = per-backlog, state = per-title, palette =
 * per-catalog). Internal (a "use server" file may only EXPORT async functions).
 */
async function ensureUserItemAndMembership(opts: {
  userId: string;
  backlogId: string;
  catalogItemId: string;
  paletteHex?: string[] | null;
  sourceCrossMediaRecId?: string | null;
}): Promise<{ membershipId: string | null; userItemId: string }> {
  // 1. Persist the cover-derived palette onto the shared catalog row — only if
  //    absent, so one user's extraction fills it for everyone and a CORS-empty
  //    ([]) or a re-add never clobbers a real value.
  if (opts.paletteHex && opts.paletteHex.length > 0) {
    await db
      .update(catalogItems)
      .set({ paletteHex: opts.paletteHex })
      .where(
        and(
          eq(catalogItems.id, opts.catalogItemId),
          isNull(catalogItems.paletteHex),
        ),
      );
  }

  // 2. Ensure the per-title state row. Existing state WINS (onConflictDoNothing):
  //    re-adding a title, or accepting a reco for one you already have, never
  //    resets its status/obsession. Provenance is only seeded on a fresh create.
  await db
    .insert(userItems)
    .values({
      userId: opts.userId,
      catalogItemId: opts.catalogItemId,
      sourceCrossMediaRecId: opts.sourceCrossMediaRecId ?? null,
    })
    .onConflictDoNothing({
      target: [userItems.userId, userItems.catalogItemId],
    });
  const [ui] = await db
    .select({ id: userItems.id })
    .from(userItems)
    .where(
      and(
        eq(userItems.userId, opts.userId),
        eq(userItems.catalogItemId, opts.catalogItemId),
      ),
    )
    .limit(1);

  // 3. Add the membership (idempotent per backlog). Resolve the id either way so
  //    the caller can still act on an already-present row (Descubrir toggle).
  const [inserted] = await db
    .insert(backlogItems)
    .values({
      backlogId: opts.backlogId,
      userId: opts.userId,
      catalogItemId: opts.catalogItemId,
    })
    .onConflictDoNothing({
      target: [backlogItems.backlogId, backlogItems.catalogItemId],
    })
    .returning({ id: backlogItems.id });
  let membershipId = inserted?.id ?? null;
  if (!membershipId) {
    const [existing] = await db
      .select({ id: backlogItems.id })
      .from(backlogItems)
      .where(
        and(
          eq(backlogItems.backlogId, opts.backlogId),
          eq(backlogItems.catalogItemId, opts.catalogItemId),
        ),
      )
      .limit(1);
    membershipId = existing?.id ?? null;
  }

  return { membershipId, userItemId: ui!.id };
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

  // "layout" over the /backlogs segment: one call covers the shelf list, both
  // zoom twins ([backlogId] + the intercepted @modal) and the lenses.
  revalidatePath("/backlogs", "layout");
  // Return the membership id (new OR pre-existing) so the caller can still mark
  // it as added / allow removal (the Descubrir search toggle relies on this).
  return membershipId ? { id: membershipId } : { error: "invalid" as const };
}

/**
 * Add the same title to a second backlog (or the accept flow) — reuses the
 * shared helper so the per-title state/palette are untouched, only a membership
 * is created. Exposed for callers that already hold a resolved backlog id.
 */
export async function ensureMembership(opts: {
  userId: string;
  backlogId: string;
  catalogItemId: string;
  paletteHex?: string[] | null;
  sourceCrossMediaRecId?: string | null;
}) {
  return ensureUserItemAndMembership(opts);
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
 * "Ocultar recomendación" (detail ⋯ menu) — drops the AI-provenance link so the
 * row stops showing the ✦ destello and the detail stops rendering the "¿Por
 * qué?" narrative. One-way by design: the rec id isn't recoverable.
 */
export async function hideRecoProvenanceAction(catalogItemId: string) {
  const { item } = await assertOwnsUserItem(catalogItemId);
  await db
    .update(userItems)
    .set({ sourceCrossMediaRecId: null })
    .where(eq(userItems.id, item.id));
  revalidatePath("/backlogs", "layout");
  return { ok: true as const };
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
  revalidatePath("/backlogs", "layout");
  return { ok: true as const };
}

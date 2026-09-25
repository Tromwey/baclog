import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { backlogItems, backlogs, userItems } from "@/db/schema";
import { fillCatalogPalette, getCatalogItem } from "@/modules/catalog/cache";
import { backfillPreorderDate } from "@/modules/catalog/preorder";
import { deleteOwnReview } from "@/modules/reviews/write";

/**
 * The one place a title enters a user's world: ensure the shared cover palette,
 * the per-title state row (user_item), and the per-backlog membership all exist.
 * Shared by addItemAction and the cross-media accept flow so both keep the three
 * levels consistent (membership = per-backlog, state = per-title, palette =
 * per-catalog).
 *
 * SECURITY, why it lives HERE and not in a "use server" file: it takes a
 * `userId`, and in a "use server" module every exported async function becomes
 * a callable HTTP endpoint — which would make this an unauthenticated "write a
 * membership into any account" RPC, exactly what AGENTS.md forbids ("never
 * accept a userId across an RPC boundary"). Its previous home exported a
 * one-line `ensureMembership` wrapper that was precisely that. Callers must
 * derive the userId themselves via assertUser/assertOwnsBacklog first.
 */
export async function ensureUserItemAndMembership(opts: {
  userId: string;
  backlogId: string;
  catalogItemId: string;
  paletteHex?: string[] | null;
  sourceCrossMediaRecId?: string | null;
}): Promise<{ membershipId: string | null; userItemId: string }> {
  // 1. Persist the cover-derived palette onto the shared catalog row — only if
  //    absent, so one user's extraction fills it for everyone and a CORS-empty
  //    ([]) or a re-add never clobbers a real value.
  await fillCatalogPalette(opts.catalogItemId, opts.paletteHex);

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

  if (!ui) {
    // The insert above is ON CONFLICT DO NOTHING, so the row exists unless
    // something deleted it between the two statements — say so loudly
    // rather than crash on a null a line later.
    throw new Error(
      `user_item missing right after upsert (userId=${opts.userId}, catalogItemId=${opts.catalogItemId})`,
    );
  }
  return { membershipId, userItemId: ui.id };
}

// ---------- the three membership operations (web actions + API v1) ----------

export type AddTitleResult =
  | { ok: true; membershipId: string; userItemId: string }
  | { ok: false; error: "backlog_not_found" | "title_not_found" };

/**
 * Put a title into one of the user's backlogs: the shared ensure above plus
 * the F3.8 pre-order backfill. Idempotent — a title already in that backlog
 * resolves to its existing membership. Re-checks the backlog against
 * `userId` in the query even when the caller already did (`assertOwnsBacklog`
 * on the web, the bearer + `assertOwnsBacklog` in the API): an id that got
 * here by mistake still can't write into someone else's shelf.
 */
export async function addTitleToBacklog(
  userId: string,
  backlogId: string,
  catalogItemId: string,
  paletteHex?: string[] | null,
): Promise<AddTitleResult> {
  const [owned] = await db
    .select({ id: backlogs.id })
    .from(backlogs)
    .where(and(eq(backlogs.id, backlogId), eq(backlogs.userId, userId)))
    .limit(1);
  if (!owned) return { ok: false, error: "backlog_not_found" };

  // The FK would reject an unknown title anyway, but as a 500 — say it first.
  const item = await getCatalogItem(catalogItemId);
  if (!item) return { ok: false, error: "title_not_found" };

  const { membershipId, userItemId } = await ensureUserItemAndMembership({
    userId,
    backlogId,
    catalogItemId,
    paletteHex: paletteHex ?? null,
  });
  if (!membershipId) return { ok: false, error: "backlog_not_found" };

  await backfillPreorderDate(catalogItemId);
  return { ok: true, membershipId, userItemId };
}

/**
 * F3.9 — a review belongs to a title the user KEEPS. There is no FK from
 * item_review to user_item to cascade from (they're independent tables by
 * design), so the two removes that GC the per-title state delete it
 * explicitly (`deleteOwnReview`, modules/reviews/write.ts). Leaving it behind
 * would keep a review in the public feed for a title its author no longer
 * has, with a reaction glyph read off a row that no longer exists.
 */
async function gcUserItem(userId: string, catalogItemId: string): Promise<void> {
  await db
    .delete(userItems)
    .where(
      and(eq(userItems.userId, userId), eq(userItems.catalogItemId, catalogItemId)),
    );
  await deleteOwnReview(userId, catalogItemId);
}

/**
 * Quitar de ESTE backlog — deletes one membership. If the title has no
 * membership left afterwards, GC the per-title state (user_item, which
 * cascades its reco feedback) and the review. The GC runs EVEN when nothing
 * was deleted (a retried DELETE, or a first call that died between the two
 * statements): idempotence covers the GC, so a repeat converges on the same
 * end state instead of leaving an orphaned user_item behind. Scoped by
 * `userId` on the membership row itself (denormalized column), so a backlog
 * id the caller doesn't own matches nothing.
 */
export async function removeTitleFromBacklog(
  userId: string,
  backlogId: string,
  catalogItemId: string,
): Promise<void> {
  await db
    .delete(backlogItems)
    .where(
      and(
        eq(backlogItems.userId, userId),
        eq(backlogItems.backlogId, backlogId),
        eq(backlogItems.catalogItemId, catalogItemId),
      ),
    );

  const [remaining] = await db
    .select({ id: backlogItems.id })
    .from(backlogItems)
    .where(
      and(eq(backlogItems.userId, userId), eq(backlogItems.catalogItemId, catalogItemId)),
    )
    .limit(1);
  if (!remaining) await gcUserItem(userId, catalogItemId);
}

/**
 * Quitar de mi biblioteca — every membership, the per-title state and the
 * review, in that order. Idempotent: a title the user never had is a no-op.
 */
export async function removeTitleFromLibrary(
  userId: string,
  catalogItemId: string,
): Promise<void> {
  await db
    .delete(backlogItems)
    .where(
      and(eq(backlogItems.userId, userId), eq(backlogItems.catalogItemId, catalogItemId)),
    );
  await gcUserItem(userId, catalogItemId);
}

import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { backlogItems, catalogItems, userItems } from "@/db/schema";

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

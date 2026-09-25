import "server-only";
import { and, desc, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { userBlocks, userFollows, users } from "@/db/schema";
import { parseHandleOrNull } from "@/modules/account/username";

/**
 * Bloquear (App Store 1.2, 2026-09-24) — the block mutations and the owner's
 * list, behind `PUT/DELETE/GET /api/v1/me/blocks`. Every function keys on the
 * caller's id and only writes the caller's OWN rows. Takes a `viewerId`:
 * never a "use server" file.
 *
 * Semantics (decided with the founder): stored one way, MUTUAL in
 * visibility — see `block-gate.ts` for the read side. Blocking deletes the
 * follow edges in BOTH directions in the same transaction, and `followUser`
 * refuses to recreate either while the row exists.
 */

export type BlockResult = { ok: true } | { error: "not_found" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Block the account at `username`. Public or private makes no difference —
 * someone who bothered you can go private right after, and the block must
 * still land. Malformed, nonexistent and own handles are the SAME
 * `not_found` (the API answers one identical 404). Idempotent: blocking twice
 * is one row (and re-deletes follow edges, which are gone already).
 *
 * The existence of a PRIVATE handle is not a secret this reveals: the
 * username availability check (`checkUsername`) already answers it.
 */
export async function blockUser(viewerId: string, username: string): Promise<BlockResult> {
  const handle = parseHandleOrNull(username);
  if (!handle) return { error: "not_found" };

  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, handle))
    .limit(1);
  if (!target || target.id === viewerId) return { error: "not_found" };

  // One transaction (neon-http `batch`): the block row and both follow edges
  // change together, so there is never a moment where the block exists and a
  // follow still feeds one side's activity to the other.
  await db.batch([
    db
      .insert(userBlocks)
      .values({ blockerUserId: viewerId, blockedUserId: target.id })
      .onConflictDoNothing(),
    db
      .delete(userFollows)
      .where(
        or(
          and(
            eq(userFollows.followerUserId, viewerId),
            eq(userFollows.followedUserId, target.id),
          ),
          and(
            eq(userFollows.followerUserId, target.id),
            eq(userFollows.followedUserId, viewerId),
          ),
        ),
      ),
  ]);
  return { ok: true };
}

/**
 * Lift the caller's block. `ref` is a handle OR the opaque `id` that
 * `listBlocked` hands out (the blocked account's user id) — the list has to
 * offer a way back for someone whose handle it no longer shows (they went
 * private or dropped their handle). Handles never contain `-`, so a UUID can't
 * be mistaken for one. Idempotent and never varies: unknown handle, unknown
 * id, or no block → still ok (it only ever deletes the caller's own row).
 * Only a ref that is neither a UUID nor a possible handle is `not_found`.
 */
export async function unblockUser(viewerId: string, ref: string): Promise<BlockResult> {
  let targetId: string | null = null;
  if (UUID_RE.test(ref)) {
    targetId = ref.toLowerCase();
  } else {
    const handle = parseHandleOrNull(ref);
    if (!handle) return { error: "not_found" };
    const [target] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, handle))
      .limit(1);
    targetId = target?.id ?? null;
  }
  if (targetId) {
    await db
      .delete(userBlocks)
      .where(
        and(
          eq(userBlocks.blockerUserId, viewerId),
          eq(userBlocks.blockedUserId, targetId),
        ),
      );
  }
  return { ok: true };
}

export interface BlockedPerson {
  /** The blocked account's user id — opaque to the client, seen only by the
   *  blocker, and accepted back by `unblockUser`. */
  id: string;
  /** Null when they are no longer a public profile with a handle. */
  handle: string | null;
  name: string;
  /** Null under the same condition as `handle`. */
  avatarUrl: string | null;
}

/** Shown for a blocked account that is no longer public — the only identity
 *  the list gives out for it. */
export const PRIVATE_BLOCKED_NAME = "Perfil privado";

/**
 * The caller's block list, newest first. Owner-only (no route lists anyone
 * else's). Identity follows the rest of the social module: handle, name and
 * photo travel only while the blocked account is PUBLIC with a handle
 * (the `publicAuthor` rule, evaluated per row); otherwise the row is `{ id, handle: null, name: "Perfil
 * privado", avatarUrl: null }` — a private account's current handle, name and
 * photo are theirs, and the blocker already knows who they blocked. The `id`
 * is what lets that row still be unblocked.
 */
export async function listBlocked(viewerId: string): Promise<BlockedPerson[]> {
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      name: users.name,
      image: users.image,
      isPublic: users.isPublic,
    })
    .from(userBlocks)
    .innerJoin(users, eq(users.id, userBlocks.blockedUserId))
    .where(eq(userBlocks.blockerUserId, viewerId))
    .orderBy(desc(userBlocks.createdAt), desc(userBlocks.blockedUserId));

  return rows.map((r) =>
    r.isPublic && r.username
      ? { id: r.id, handle: r.username, name: r.name ?? r.username, avatarUrl: r.image }
      : { id: r.id, handle: null, name: PRIVATE_BLOCKED_NAME, avatarUrl: null },
  );
}

/**
 * The block relation between the viewer and the account at `username`, both
 * ways, in one query — for the profile-level decisions the list gates can't
 * make (`GET /people/{handle}` and its collections). Unknown handle → both
 * false (the profile read decides the 404).
 */
export async function blockStateWith(
  viewerId: string,
  username: string,
): Promise<{ blockedByViewer: boolean; blocksViewer: boolean }> {
  const rows = await db
    .select({ blocker: userBlocks.blockerUserId })
    .from(userBlocks)
    .innerJoin(
      users,
      or(
        and(eq(userBlocks.blockerUserId, viewerId), eq(userBlocks.blockedUserId, users.id)),
        and(eq(userBlocks.blockerUserId, users.id), eq(userBlocks.blockedUserId, viewerId)),
      ),
    )
    .where(eq(users.username, username));
  return {
    blockedByViewer: rows.some((r) => r.blocker === viewerId),
    blocksViewer: rows.some((r) => r.blocker !== viewerId),
  };
}

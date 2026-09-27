import "server-only";
import { and, eq, isNotNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { backlogItems, backlogs } from "@/db/schema";
import {
  getCollectionsWithMemberships,
  type CollectionWithMemberships,
} from "./shelves";
import { VISIBILITY, type BacklogVisibility } from "./visibility";

/**
 * Backlog (colección) CRUD with an EXPLICIT `userId` — the one write path
 * the web actions (`backlog-actions.ts`) and the API v1 handlers
 * (`api/v1/collections/**`) share.
 *
 * SECURITY: every statement scopes by `userId` in its `where`, so even a
 * caller that resolved the wrong backlog id can't touch another account's
 * row. Callers still derive the user themselves (`assertUser` /
 * `assertOwnsBacklog` / the bearer) — this module never accepts a userId
 * across an RPC boundary, which is why it is NOT a "use server" file (see the
 * note in membership.ts).
 */

export const backlogNameSchema = z.string().trim().min(1).max(60);
export const backlogVibeSchema = z.string().trim().max(80);

export interface CreateBacklogInput {
  name: string;
  vibe?: string | null;
  /** DB default (both columns true) = `featured` — the profile escaparate. */
  visibility?: BacklogVisibility;
}

export async function createBacklog(
  userId: string,
  input: CreateBacklogInput,
): Promise<{ id: string }> {
  const name = backlogNameSchema.parse(input.name);
  const vibe = input.vibe == null ? null : backlogVibeSchema.parse(input.vibe) || null;
  const [created] = await db
    .insert(backlogs)
    .values({
      userId,
      name,
      vibe,
      ...(input.visibility ? VISIBILITY[input.visibility] : {}),
    })
    .returning({ id: backlogs.id });
  return { id: created.id };
}

export interface UpdateBacklogInput {
  name?: string;
  /** `undefined` = leave alone · `""` / `null` = clear. */
  vibe?: string | null;
  /**
   * F3.10.1 triad — always written as a PAIR through `VISIBILITY`, so the two
   * columns can never disagree (featured implies public).
   */
  visibility?: BacklogVisibility;
}

/**
 * Patch name / vibe / visibility. Returns false when the (backlogId, userId)
 * pair matched nothing — the caller decides whether that is a 404 (it always
 * is: ownership failures are indistinguishable from nonexistence). An EMPTY
 * patch writes nothing (not even `updatedAt` — "updated" means a field
 * changed) and only answers whether the row is the user's.
 */
export async function updateBacklog(
  userId: string,
  backlogId: string,
  input: UpdateBacklogInput,
): Promise<boolean> {
  const patch: Partial<typeof backlogs.$inferInsert> = {};
  if (input.name !== undefined) patch.name = backlogNameSchema.parse(input.name);
  if (input.vibe !== undefined) {
    patch.vibe = input.vibe === null ? null : backlogVibeSchema.parse(input.vibe) || null;
  }
  if (input.visibility !== undefined) Object.assign(patch, VISIBILITY[input.visibility]);

  if (Object.keys(patch).length === 0) {
    const [own] = await db
      .select({ id: backlogs.id })
      .from(backlogs)
      .where(and(eq(backlogs.id, backlogId), eq(backlogs.userId, userId)))
      .limit(1);
    return Boolean(own);
  }
  patch.updatedAt = new Date();

  const updated = await db
    .update(backlogs)
    .set(patch)
    .where(and(eq(backlogs.id, backlogId), eq(backlogs.userId, userId)))
    .returning({ id: backlogs.id });
  return updated.length > 0;
}

/**
 * Colecciones formalizado — pin ONE collection (or unpin it). The partial
 * unique index `backlog_one_pinned_per_user` allows a single pinned row per
 * user, so pinning clears the old pin FIRST, in the same batch (Neon HTTP
 * batch = one transaction): never two pins, never a unique violation.
 * Returns false when the (backlogId, userId) pair matched nothing.
 */
export async function setBacklogPinned(
  userId: string,
  backlogId: string,
  pinned: boolean,
): Promise<boolean> {
  if (!pinned) {
    const updated = await db
      .update(backlogs)
      .set({ pinnedAt: null })
      .where(and(eq(backlogs.id, backlogId), eq(backlogs.userId, userId)))
      .returning({ id: backlogs.id });
    return updated.length > 0;
  }
  const [, updated] = await db.batch([
    db
      .update(backlogs)
      .set({ pinnedAt: null })
      .where(
        and(eq(backlogs.userId, userId), isNotNull(backlogs.pinnedAt), ne(backlogs.id, backlogId)),
      ),
    db
      .update(backlogs)
      .set({ pinnedAt: new Date() })
      .where(and(eq(backlogs.id, backlogId), eq(backlogs.userId, userId)))
      .returning({ id: backlogs.id }),
  ]);
  return updated.length > 0;
}

/**
 * The collection's chosen cover (the front of its fan), or `null` for "the
 * first title in the order". The title must be a member of THIS collection:
 * the update only matches when the membership exists, in the same statement,
 * so a stale id from the client writes nothing. Returns false otherwise.
 */
export async function setBacklogCover(
  userId: string,
  backlogId: string,
  catalogItemId: string | null,
): Promise<boolean> {
  const member =
    catalogItemId === null
      ? sql`true`
      : sql`exists (select 1 from ${backlogItems} where ${backlogItems.backlogId} = ${backlogId} and ${backlogItems.catalogItemId} = ${catalogItemId})`;
  const updated = await db
    .update(backlogs)
    .set({ coverCatalogItemId: catalogItemId })
    .where(and(eq(backlogs.id, backlogId), eq(backlogs.userId, userId), member))
    .returning({ id: backlogs.id });
  return updated.length > 0;
}

/**
 * The manual order (Reordenar): `orderedIds` are membership (`backlog_item`)
 * ids, first to last. Renumbers the collection in ONE statement — positions
 * 0…n−1 from the array's ordinality — scoped by backlog AND user inside the
 * statement, so an id from another collection or account simply doesn't
 * match. Ids of this collection that the array left out (a title added while
 * the sheet was open) go back to null = on top, newest first. Returns false
 * when the backlog isn't the user's.
 */
export const reorderSchema = z.array(z.string().min(1).max(64)).max(2000);

export async function reorderBacklogItems(
  userId: string,
  backlogId: string,
  orderedIds: string[],
): Promise<boolean> {
  const ids = reorderSchema.parse(orderedIds);
  const [own] = await db
    .select({ id: backlogs.id })
    .from(backlogs)
    .where(and(eq(backlogs.id, backlogId), eq(backlogs.userId, userId)))
    .limit(1);
  if (!own) return false;
  const json = JSON.stringify(ids);
  await db.execute(sql`
    update ${backlogItems} as b
    set position = o.pos
    from (
      select ${backlogItems.id} as id,
        case when u.ord is null then null
          else (row_number() over (partition by u.ord is null order by u.ord) - 1)::int
        end as pos
      from ${backlogItems}
      left join jsonb_array_elements_text(${json}::jsonb) with ordinality as u(id, ord)
        on u.id = ${backlogItems.id}
      where ${backlogItems.backlogId} = ${backlogId} and ${backlogItems.userId} = ${userId}
    ) as o
    where b.id = o.id and b.backlog_id = ${backlogId} and b.user_id = ${userId}
  `);
  await db
    .update(backlogs)
    .set({ updatedAt: new Date() })
    .where(and(eq(backlogs.id, backlogId), eq(backlogs.userId, userId)));
  return true;
}

/**
 * Drop the backlog; its memberships cascade (FK). NO GC of `user_item` here,
 * same as the web: a title that lived only in this backlog keeps its per-title
 * state (status/verdict/obsession) and its review, orphaned from any shelf.
 * Returns false when nothing matched.
 */
export async function deleteBacklog(userId: string, backlogId: string): Promise<boolean> {
  const deleted = await db
    .delete(backlogs)
    .where(and(eq(backlogs.id, backlogId), eq(backlogs.userId, userId)))
    .returning({ id: backlogs.id });
  return deleted.length > 0;
}

/**
 * ONE backlog of the user with all its memberships — what a write handler
 * returns after mutating (ios/API.md §1: writes return the resource). The
 * same reader as `GET /collections`, narrowed to the one id, so the wire
 * shape can't drift from the list. Null when the id isn't the user's.
 */
export async function getOwnCollection(
  userId: string,
  backlogId: string,
): Promise<CollectionWithMemberships | null> {
  const [row] = await getCollectionsWithMemberships(userId, { backlogId });
  return row ?? null;
}

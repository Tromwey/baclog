import "server-only";
import { createHash } from "node:crypto";
import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import { NotFoundError } from "@/authz/errors";
import { db } from "@/db";
import { backlogItems, backlogs, catalogItems, itemReviews, userItems } from "@/db/schema";
import { LIBRARY_MEDIA_TYPES, libraryMedia } from "@/modules/catalog/library-media";
import { isPartyBacklogSql } from "@/modules/party-collections/gate";
import { fillCatalogPalette } from "@/modules/catalog/cache";
import { backfillPreorderDate } from "@/modules/catalog/preorder";

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
  // 0. Colecciones de fiesta (0033): a party only takes songs through
  //    modules/party-collections, and a song (`track`) never gets a
  //    `user_item` — this is one of the two places one is born (the other is
  //    `setMark`, which reads the title through the library-only
  //    `getCatalogItem`). ONE probe: library title AND non-party backlog.
  //    NotFound, like any id the caller can't write to.
  if (!(await isLibraryTitleInNormalBacklog(opts.backlogId, opts.catalogItemId))) {
    throw new NotFoundError("Title or collection not writable here");
  }
  return writeUserItemAndMembership(opts);
}

/**
 * The lock every write that creates or GCs a title's per-title state takes
 * FIRST, inside its batch (= one transaction): a transaction-scoped advisory
 * lock on the (user, title) pair, released at commit/rollback.
 *
 * Why a lock and not "one statement": `user_item` must exist while the title
 * has a membership, and two writers decide that from opposite ends — an add
 * says "the state exists, I only add a membership", a remove says "no
 * membership is left, I drop the state". Under READ COMMITTED each decides on
 * its own snapshot, so they can both be right about the past and leave a
 * membership with no state behind (the add found the row a moment before the
 * remove of the last OTHER membership GC'd it). Folding the add into a single
 * CTE does not close it: the remove's `NOT EXISTS` still can't see a
 * membership that hasn't committed, and a row lock doesn't help either (a
 * re-checked `DELETE … WHERE NOT EXISTS (…)` re-reads the locked row, not the
 * subquery). Serializing both sides on the pair does: whoever comes second
 * takes its snapshots AFTER the first committed.
 *
 * One key per pair, so unrelated titles never wait on each other; a writer
 * of a single pair holds one lock and can't deadlock.
 */
export function titleStateLock(userId: string, catalogItemId: string) {
  return db.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`kura:user_item:${userId}:${catalogItemId}`}, 0))`,
  );
}

/**
 * The writes of `ensureUserItemAndMembership`, for a caller that ALREADY
 * proved "library title AND non-party backlog" (the probe above, or
 * `addTitleToBacklog`'s own single probe, which answers that plus ownership
 * in one round trip). Not exported: skipping the probe is only safe next to
 * the query that replaced it.
 *
 * The state row and the membership are written in ONE `db.batch` (a single
 * transaction on neon-http) behind `titleStateLock`: both exist or neither
 * does, and a concurrent "quitar" of the title's last other membership
 * either runs entirely before (its GC'd state is re-created here, fresh) or
 * entirely after (it sees this membership and GCs nothing). Before, they were
 * separate round trips and the remove could delete the `user_item` in the
 * gap, leaving a membership with no state.
 */
async function writeUserItemAndMembership(opts: {
  userId: string;
  backlogId: string;
  catalogItemId: string;
  paletteHex?: string[] | null;
  sourceCrossMediaRecId?: string | null;
}): Promise<{ membershipId: string | null; userItemId: string }> {
  // 1. Persist the cover-derived palette onto the shared catalog row — only if
  //    absent, so one user's extraction fills it for everyone and a CORS-empty
  //    ([]) or a re-add never clobbers a real value. Outside the batch: it is
  //    the shared catalog row, not this user's state.
  await fillCatalogPalette(opts.catalogItemId, opts.paletteHex);

  const [, , uiRows, , memberRows] = await db.batch([
    titleStateLock(opts.userId, opts.catalogItemId),
    // 2. Ensure the per-title state row. Existing state WINS
    //    (onConflictDoNothing): re-adding a title, or accepting a reco for one
    //    you already have, never resets its status/obsession. Provenance is
    //    only seeded on a fresh create.
    db
      .insert(userItems)
      .values({
        userId: opts.userId,
        catalogItemId: opts.catalogItemId,
        sourceCrossMediaRecId: opts.sourceCrossMediaRecId ?? null,
      })
      .onConflictDoNothing({
        target: [userItems.userId, userItems.catalogItemId],
      }),
    db
      .select({ id: userItems.id })
      .from(userItems)
      .where(
        and(
          eq(userItems.userId, opts.userId),
          eq(userItems.catalogItemId, opts.catalogItemId),
        ),
      )
      .limit(1),
    // 3. Add the membership (idempotent per backlog), then read its id either
    //    way so the caller can still act on an already-present row (Descubrir
    //    toggle).
    db
      .insert(backlogItems)
      .values({
        backlogId: opts.backlogId,
        userId: opts.userId,
        catalogItemId: opts.catalogItemId,
      })
      .onConflictDoNothing({
        target: [backlogItems.backlogId, backlogItems.catalogItemId],
      }),
    db
      .select({ id: backlogItems.id })
      .from(backlogItems)
      .where(
        and(
          eq(backlogItems.backlogId, opts.backlogId),
          eq(backlogItems.catalogItemId, opts.catalogItemId),
        ),
      )
      .limit(1),
  ]);
  const ui = uiRows[0];
  if (!ui) {
    // Same transaction, same lock: the row was just ensured. Say so loudly
    // rather than crash on a null a line later.
    throw new Error(
      `user_item missing right after upsert (userId=${opts.userId}, catalogItemId=${opts.catalogItemId})`,
    );
  }
  return { membershipId: memberRows[0]?.id ?? null, userItemId: ui.id };
}

/**
 * True when `catalogItemId` is a LIBRARY title (film · series · album) and
 * `backlogId` is not a party collection. One round trip.
 */
async function isLibraryTitleInNormalBacklog(
  backlogId: string,
  catalogItemId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ party: isPartyBacklogSql(sql`${backlogId}`) })
    .from(catalogItems)
    .where(and(eq(catalogItems.id, catalogItemId), libraryMedia()))
    .limit(1);
  return Boolean(row) && !row.party;
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
  // ONE probe for the three questions this used to ask in four round trips
  // (owned backlog · full catalog row · library-and-not-party, the last one
  // twice — again inside the ensure): the row exists only for a backlog the
  // caller owns; `title` says the id is a LIBRARY title (a party song is "not
  // found" here, like through the library-only `getCatalogItem`); `party`
  // refuses a party collection, which takes songs only through
  // modules/party-collections.
  const [probe] = await db
    .select({
      title: sql<boolean>`exists (select 1 from "catalog_item" ci where ci.id = ${catalogItemId} and ${inArray(sql`ci.media_type`, [...LIBRARY_MEDIA_TYPES])})`,
      party: isPartyBacklogSql(backlogs.id),
    })
    .from(backlogs)
    .where(and(eq(backlogs.id, backlogId), eq(backlogs.userId, userId)))
    .limit(1);
  if (!probe) return { ok: false, error: "backlog_not_found" };
  // The FK would reject an unknown title anyway, but as a 500 — say it first.
  if (!probe.title) return { ok: false, error: "title_not_found" };
  if (probe.party) return { ok: false, error: "backlog_not_found" };

  const { membershipId, userItemId } = await writeUserItemAndMembership({
    userId,
    backlogId,
    catalogItemId,
    paletteHex: paletteHex ?? null,
  });
  if (!membershipId) return { ok: false, error: "backlog_not_found" };

  await backfillPreorderDate(catalogItemId);
  return { ok: true, membershipId, userItemId };
}

/** `NOT EXISTS (a membership of this title in any of the user's backlogs)`.
 *  Aliased and built from what the caller passes only, so it reads the same
 *  inside a DELETE on `user_item` and one on `item_review`. `catalogItemId`
 *  is one id (bound as a parameter) or the outer statement's column (the
 *  set-based GC of `deleteBacklog({ purge })`). The ONE definition of "the
 *  title is no longer in the user's library" — don't re-inline it. */
export function noMembershipLeft(userId: string, catalogItemId: string | SQL): SQL {
  return sql`not exists (select 1 from ${backlogItems} as "m" where "m"."user_id" = ${userId} and "m"."catalog_item_id" = ${catalogItemId})`;
}

/**
 * `titleStateLock` for MANY titles of one user, as one statement: the same
 * key per pair, taken in id order so two multi-title writers can't deadlock.
 * First statement of the batch, like the single lock.
 */
export function titleStateLocks(userId: string, catalogItemIds: string[]) {
  const sorted = JSON.stringify([...new Set(catalogItemIds)].sort());
  const lockPrefix = `kura:user_item:${userId}:`;
  return db.execute(sql`
    select pg_advisory_xact_lock(hashtextextended(${lockPrefix} || k.id, 0))
    from (select t.id from jsonb_array_elements_text(${sorted}::jsonb) as t(id) order by t.id) k
  `);
}

/**
 * Quitar de ESTE backlog — deletes one membership and, if the title has no
 * membership left, GCs the per-title state (user_item, which cascades its
 * reco feedback) and the review.
 *
 * F3.9 — a review belongs to a title the user KEEPS. There is no FK from
 * item_review to user_item to cascade from (they're independent tables by
 * design), so the GC deletes it explicitly. Leaving it behind would keep a
 * review in the public feed for a title its author no longer has, with a
 * reaction glyph read off a row that no longer exists.
 *
 * ONE `db.batch` (a single transaction on neon-http) that starts by taking
 * `titleStateLock` — so it never interleaves with an add of the same title
 * (see the lock) — and the "last membership?" question is asked INSIDE each
 * GC statement (`NOT EXISTS`), not read in between:
 * - before, it was delete → select → delete → delete as four separate
 *   round trips. A crash between them left an orphaned user_item or a review
 *   with no title behind it;
 * - the batch alone did NOT stop a concurrent "guardar en" from losing its
 *   state (its membership isn't visible to this `NOT EXISTS` until it
 *   commits): the lock is what does;
 * - the GC statements still run when the first one deleted nothing (a
 *   retried DELETE), so a repeat converges on the same end state.
 * Scoped by `userId` on every row (denormalized on the membership), so a
 * backlog id the caller doesn't own matches nothing.
 */
export async function removeTitleFromBacklog(
  userId: string,
  backlogId: string,
  catalogItemId: string,
): Promise<void> {
  await db.batch([
    titleStateLock(userId, catalogItemId),
    db
      .delete(backlogItems)
      .where(
        and(
          eq(backlogItems.userId, userId),
          eq(backlogItems.backlogId, backlogId),
          eq(backlogItems.catalogItemId, catalogItemId),
        ),
      ),
    db
      .delete(userItems)
      .where(
        and(
          eq(userItems.userId, userId),
          eq(userItems.catalogItemId, catalogItemId),
          noMembershipLeft(userId, catalogItemId),
        ),
      ),
    db
      .delete(itemReviews)
      .where(
        and(
          eq(itemReviews.userId, userId),
          eq(itemReviews.catalogItemId, catalogItemId),
          noMembershipLeft(userId, catalogItemId),
        ),
      ),
  ]);
}

/**
 * Quitar de mi biblioteca — every membership, the per-title state and the
 * review, in one batch (all or nothing) behind `titleStateLock`, so an add
 * of the same title in flight lands entirely before or entirely after.
 * Idempotent: a title the user never had is a no-op.
 */
export async function removeTitleFromLibrary(
  userId: string,
  catalogItemId: string,
): Promise<void> {
  await db.batch([
    titleStateLock(userId, catalogItemId),
    db
      .delete(backlogItems)
      .where(
        and(eq(backlogItems.userId, userId), eq(backlogItems.catalogItemId, catalogItemId)),
      ),
    db
      .delete(userItems)
      .where(and(eq(userItems.userId, userId), eq(userItems.catalogItemId, catalogItemId))),
    db
      .delete(itemReviews)
      .where(and(eq(itemReviews.userId, userId), eq(itemReviews.catalogItemId, catalogItemId))),
  ]);
}

// ---------- "Guárdala en kura": a copy of a shared collection ----------

/**
 * The id of `userId`'s copy of `sourceBacklogId`: a UUID (v5-shaped) derived
 * from the pair, so the same visitor saving the same collection always
 * addresses the SAME row. That is the idempotency key of
 * `saveCollectionCopy` — no column, no migration.
 */
export function collectionCopyId(userId: string, sourceBacklogId: string): string {
  const h = createHash("sha256").update(`kura:collection-copy:${userId}:${sourceBacklogId}`).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

/**
 * Create the user's private copy of a shared collection — the collection,
 * the per-title state of every title the user didn't have, and the
 * memberships in the source's order — as ONE statement (data-modifying CTEs:
 * all or nothing), in a batch that first takes each title's `titleStateLock`.
 *
 * - ATOMIC. Before, it was `createBacklog` + up to 300 titles × ~6 round
 *   trips + reorder + cover: a timeout halfway left a half-filled collection
 *   that looked like the real thing.
 * - IDEMPOTENT. The copy's id is `collectionCopyId(user, source)` and the
 *   insert is `ON CONFLICT (id) DO NOTHING`; the titles are written ONLY when
 *   that insert created the row (they select FROM its RETURNING). So a double
 *   tap, a retry or two tabs converge on one collection — and saving again a
 *   collection you already keep gives you YOUR copy back untouched (it does
 *   not re-add titles you removed from it). Delete the copy and you can save
 *   a fresh one.
 * - Existing per-title state WINS (`ON CONFLICT DO NOTHING` on user_item),
 *   exactly like `ensureUserItemAndMembership`. No palette write: the
 *   source's palette IS the shared `catalog_item.palette_hex` already.
 * - Library titles only (`media_type IN (film, series, album)`), so a song
 *   can never get a `user_item` through here either.
 *
 * The caller reads the source through the public gate (`getPublicBacklog`)
 * and passes the titles in the order to keep; `coverCatalogItemId` must be
 * one of them (it is only written if it is).
 */
export async function saveCollectionCopy(
  userId: string,
  source: {
    backlogId: string;
    name: string;
    vibe: string | null;
    catalogItemIds: string[];
    coverCatalogItemId: string | null;
  },
): Promise<{ id: string }> {
  const id = collectionCopyId(userId, source.backlogId);
  const ids = [...new Set(source.catalogItemIds)];
  const cover =
    source.coverCatalogItemId && ids.includes(source.coverCatalogItemId)
      ? source.coverCatalogItemId
      : null;
  // Same pair lock as every other writer of per-title state (`titleStateLock`),
  // one per title, taken in id order (two copies can't deadlock) in the same
  // transaction as the statement: a "quitar" racing this copy can't GC a
  // state row the copy just decided to reuse.
  await db.batch([
    titleStateLocks(userId, ids),
    db.execute(sql`
    with src as (
      select t.catalog_item_id, (t.ord - 1)::int as position
      from jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb) with ordinality as t(catalog_item_id, ord)
      join "catalog_item" ci on ci.id = t.catalog_item_id
        and ${inArray(sql`ci.media_type`, [...LIBRARY_MEDIA_TYPES])}
    ),
    new_backlog as (
      insert into "backlog" (id, user_id, name, vibe, is_public, show_on_profile, cover_catalog_item_id)
      select ${id}, ${userId}, ${source.name}, ${source.vibe}, false, false,
        (select s.catalog_item_id from src s where s.catalog_item_id = ${cover})
      on conflict (id) do nothing
      returning id
    ),
    new_state as (
      insert into "user_item" (id, user_id, catalog_item_id)
      select gen_random_uuid()::text, ${userId}, s.catalog_item_id
      from src s, new_backlog
      on conflict (user_id, catalog_item_id) do nothing
      returning 1
    ),
    new_members as (
      insert into "backlog_item" (id, backlog_id, user_id, catalog_item_id, position)
      select gen_random_uuid()::text, nb.id, ${userId}, s.catalog_item_id, s.position
      from src s, new_backlog nb
      on conflict (backlog_id, catalog_item_id) do nothing
      returning 1
    )
    select (select count(*) from new_backlog) as created,
           (select count(*) from new_state) as states,
           (select count(*) from new_members) as members
  `),
  ]);
  return { id };
}

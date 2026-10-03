import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { isOnboarded } from "@/auth/user-row";
import { db } from "@/db";
import {
  backlogCollaborators,
  backlogItems,
  backlogs,
  catalogItems,
  parties,
  partyInvites,
  users,
} from "@/db/schema";
import { fillCatalogPalette } from "@/modules/catalog/cache";
import { getPartyAccess } from "./access";
import { findPartySong, getActiveInvite, resolveInviteToken, rowsOf } from "./queries";
import {
  DEFAULT_PER_GUEST_LIMIT,
  MAX_HOSTED_PARTIES,
  canBlockAuthor,
  canLeave,
  canRemoveSong,
  decideAdd,
  lostAddOutcome,
  partyNameSchema,
  perGuestLimitSchema,
  rotationRetryAfter,
  type AddRefusal,
} from "./rules";
import { guestRefOf, newInviteToken } from "./tokens";
import type { PartyInvite, PartyPerson } from "./types";

/**
 * Colecciones de fiesta — every WRITE, with an explicit `userId` (the session
 * or bearer user; never a "use server" file, never an id from a client). The
 * web actions (`app/actions/party-collection-actions.ts`) and the API v1
 * (`app/api/v1/parties/**`, `…/invites/**`) are thin wrappers over these.
 *
 * Authorization comes FIRST in each function (`getPartyAccess`: host or
 * member, else not_found), and every mutating statement re-checks the same
 * conditions INSIDE its SQL, so a block, a cap or a revoked link that lands
 * between the check and the write still wins.
 */

// ---------- create / edit / delete (host) ----------

export interface CreatePartyInput {
  name: string;
  /** undefined → 3 (the design's default) · null → ilimitadas · 0..5. */
  perGuestLimit?: number | null;
}

export type CreatePartyResult =
  | { ok: true; backlogId: string; invite: PartyInvite }
  /** The account already hosts `MAX_HOSTED_PARTIES` (20) parties (C7). */
  | { ok: false; error: "too_many_parties" };

/**
 * New party: a PRIVATE backlog (is_public = show_on_profile = false: a party
 * is never on /u/** nor in any feed), its `party` row, and its first invite
 * link — one transaction. Returns the id and the link token.
 *
 * At most `MAX_HOSTED_PARTIES` per host (C7): a per-host advisory lock
 * serializes two creates from the same account, and the backlog INSERT
 * re-counts inside its own SELECT — so two tabs can't both be the 20th.
 */
export async function createParty(userId: string, input: CreatePartyInput): Promise<CreatePartyResult> {
  const name = partyNameSchema.parse(input.name);
  const perGuestLimit = perGuestLimitSchema.parse(
    input.perGuestLimit === undefined ? DEFAULT_PER_GUEST_LIMIT : input.perGuestLimit,
  );
  const backlogId = randomUUID();
  const token = newInviteToken();
  const results = await db.batch([
    db.execute(sql`select pg_advisory_xact_lock(hashtext(${`party-host:${userId}`}))`),
    db.execute(sql`
      insert into backlog (id, user_id, name, vibe, is_public, show_on_profile, created_at, updated_at)
      select ${backlogId}, ${userId}, ${name}, null, false, false, now(), now()
      where (
        select count(*) from backlog b join party p on p.backlog_id = b.id where b.user_id = ${userId}
      ) < ${MAX_HOSTED_PARTIES}
      returning id
    `),
    db.execute(sql`
      insert into party (backlog_id, per_guest_limit, created_at)
      select b.id, ${perGuestLimit}, b.created_at from backlog b where b.id = ${backlogId}
    `),
    db.execute(sql`
      insert into party_invite (backlog_id, token, created_at)
      select b.id, ${token}, b.created_at from backlog b where b.id = ${backlogId}
    `),
  ]);
  if (rowsOf(results[1]).length === 0) return { ok: false, error: "too_many_parties" };
  const invite = await getActiveInvite(backlogId);
  if (!invite.active) {
    // The batch committed the backlog but its link isn't there: never hand
    // back a link that doesn't open.
    console.error("[party] createParty: no active invite after create", { backlogId });
    return { ok: true, backlogId, invite: { active: false, token: null, url: null, createdAt: null } };
  }
  return { ok: true, backlogId, invite };
}

export interface UpdatePartyInput {
  name?: string;
  perGuestLimit?: number | null;
}

/**
 * Rename and/or change "canciones por invitado" (host only). Lowering the
 * cap never removes songs already there: a guest over the new cap just can't
 * add more until they remove some. False = not the host / not a party.
 */
export async function updateParty(
  userId: string,
  backlogId: string,
  input: UpdatePartyInput,
): Promise<boolean> {
  const access = await getPartyAccess(userId, backlogId);
  if (!access || access.role !== "host") return false;
  const name = input.name === undefined ? undefined : partyNameSchema.parse(input.name);
  const limit =
    input.perGuestLimit === undefined ? undefined : perGuestLimitSchema.parse(input.perGuestLimit);
  if (name === undefined && limit === undefined) return true;
  const owns = and(eq(backlogs.id, backlogId), eq(backlogs.userId, userId));
  const statements: [BatchItem<"pg">, ...BatchItem<"pg">[]] = [
    db
      .update(backlogs)
      .set({ ...(name !== undefined ? { name } : {}), updatedAt: new Date() })
      .where(owns),
  ];
  if (limit !== undefined) {
    statements.push(
      db
        .update(parties)
        .set({ perGuestLimit: limit })
        .where(
          and(
            eq(parties.backlogId, backlogId),
            sql`exists (select 1 from backlog b where b.id = ${backlogId} and b.user_id = ${userId})`,
          ),
        ),
    );
  }
  await db.batch(statements);
  return true;
}

/** Delete the party (host only): the backlog goes and everything cascades
 *  (songs, `party_song`, `party`, invites, members). No `user_item` to GC —
 *  party songs never had one. */
export async function deleteParty(userId: string, backlogId: string): Promise<boolean> {
  const deleted = await db
    .delete(backlogs)
    .where(
      and(
        eq(backlogs.id, backlogId),
        eq(backlogs.userId, userId),
        sql`exists (select 1 from party p where p.backlog_id = ${backlogId})`,
      ),
    )
    .returning({ id: backlogs.id });
  return deleted.length > 0;
}

// ---------- invite link (host) ----------

export type RotateInviteResult =
  | { ok: true; invite: PartyInvite }
  | { ok: false; error: "not_found" }
  /** More than `INVITE_ROTATIONS_PER_HOUR` links this hour (C7). */
  | { ok: false; error: "rate_limited"; retryAfterSeconds: number }
  /** The rotation ran but no active link came out of it (a revoke racing
   *  it): never report a link that doesn't open. */
  | { ok: false; error: "conflict" };

/**
 * "Crear link nuevo": revoke the active link (if any) and mint a new one —
 * one transaction; the old link stops working at once, members stay.
 * Rate-limited per party (`INVITE_ROTATIONS_PER_HOUR`, DB-backed).
 */
export async function rotateInvite(userId: string, backlogId: string): Promise<RotateInviteResult> {
  const access = await getPartyAccess(userId, backlogId);
  if (!access || access.role !== "host") return { ok: false, error: "not_found" };
  const ages = rowsOf<{ age: number | string }>(
    await db.execute(sql`
      select extract(epoch from (now() - created_at))::float8 as age
      from party_invite
      where backlog_id = ${backlogId} and created_at > now() - interval '1 hour'
    `),
  ).map((r) => Number(r.age));
  const wait = rotationRetryAfter(ages);
  if (wait !== null) return { ok: false, error: "rate_limited", retryAfterSeconds: wait };

  for (let attempt = 0; attempt < 2; attempt++) {
    const token = newInviteToken();
    try {
      await db.batch([
        db
          .update(partyInvites)
          .set({ revokedAt: new Date() })
          .where(and(eq(partyInvites.backlogId, backlogId), isNull(partyInvites.revokedAt))),
        db.insert(partyInvites).values({ backlogId, token }),
      ]);
      break;
    } catch (err) {
      // Two rotations racing trip the one-active-link index (23505): the
      // loser retries once on top of the winner's link.
      if (attempt === 0 && sqlStateOf(err) === "23505") continue;
      throw err;
    }
  }
  const invite = await getActiveInvite(backlogId);
  if (!invite.active) {
    console.error("[party] rotateInvite: no active link after rotating", { backlogId });
    return { ok: false, error: "conflict" };
  }
  return { ok: true, invite };
}

/** "Desactivar link": nobody else can enter; members stay. Idempotent.
 *  False = not the host / not a party. */
export async function revokeInvite(userId: string, backlogId: string): Promise<boolean> {
  const access = await getPartyAccess(userId, backlogId);
  if (!access || access.role !== "host") return false;
  await db
    .update(partyInvites)
    .set({ revokedAt: new Date() })
    .where(and(eq(partyInvites.backlogId, backlogId), isNull(partyInvites.revokedAt)));
  return true;
}

// ---------- join (any signed-in, onboarded account with the link) ----------

export type JoinResult =
  | { ok: true; backlogId: string; joined: "new" | "already" | "host"; blocked: boolean }
  /** Malformed / unknown / revoked token, or a user block with the host —
   *  one answer ("este link ya no funciona"). */
  | { ok: false; error: "invalid_link" }
  /** The account hasn't finished onboarding (age + name): send it through
   *  onboarding with `?to=/f/{token}` first. */
  | { ok: false; error: "onboarding_required" };

export async function joinParty(userId: string, token: string): Promise<JoinResult> {
  const target = await resolveInviteToken(token);
  if (!target) return { ok: false, error: "invalid_link" };

  const [me] = await db
    .select({ name: users.name, isMinor: users.isMinor, ageVerified: sql<boolean>`"user"."birth_year" is not null` })
    .from(users)
    .where(sql`${users}.${sql.identifier("id")} = ${userId}`)
    .limit(1);
  if (!me || me.isMinor) {
    // Same answer as a dead link (no oracle), but the server says why: a
    // session for a missing or minor account shouldn't reach here at all.
    console.warn("[party] joinParty refused", { reason: me ? "minor" : "no_user_row", backlogId: target.backlogId });
    return { ok: false, error: "invalid_link" };
  }
  if (!isOnboarded(me)) return { ok: false, error: "onboarding_required" };

  if (target.hostId === userId) {
    return { ok: true, backlogId: target.backlogId, joined: "host", blocked: false };
  }
  // rules.ts `joinOutcome`, in ONE statement: insert (or bring back a guest
  // who LEFT, `left_at` → null, `blocked_at` untouched) only while the link
  // is STILL active and no user block exists with the host (either
  // direction) — a revoke or a block racing the join wins. An active member
  // hits the conflict with `left_at` null → no row → "already" below.
  const entered = rowsOf<{ inserted: boolean; blocked: boolean }>(
    await db.execute(sql`
      insert into backlog_collaborator (backlog_id, user_id, created_at)
      select b.id, ${userId}, now()
      from backlog b
      where b.id = ${target.backlogId}
        and exists (select 1 from party_invite i where i.backlog_id = b.id and i.token = ${token} and i.revoked_at is null)
        and not exists (
          select 1 from user_block ub
          where (ub.blocker_user_id = ${userId} and ub.blocked_user_id = b.user_id)
             or (ub.blocker_user_id = b.user_id and ub.blocked_user_id = ${userId})
        )
      on conflict (backlog_id, user_id) do update set left_at = null
        where backlog_collaborator.left_at is not null
      returning (xmax = 0) as inserted, (blocked_at is not null) as blocked
    `),
  );
  if (entered.length > 0) {
    return { ok: true, backlogId: target.backlogId, joined: "new", blocked: Boolean(entered[0].blocked) };
  }
  const access = await getPartyAccess(userId, target.backlogId);
  if (!access) return { ok: false, error: "invalid_link" };
  return { ok: true, backlogId: target.backlogId, joined: "already", blocked: access.blocked };
}

// ---------- leave (a guest) ----------

/**
 * "Salir de la fiesta" (contract C3) — guests only; false = not a guest of
 * this party (the host included: a host deletes, never leaves) → 404.
 * rules.ts `leaveEffect`: an unblocked guest's row is deleted (they may come
 * back with an active link); a blocked guest's row is kept with `left_at`
 * so the block survives a leave + re-enter. Their songs stay, attributed.
 */
export async function leaveParty(userId: string, backlogId: string): Promise<boolean> {
  const access = await getPartyAccess(userId, backlogId);
  if (!access || !canLeave(access.role)) return false;
  const [deleted, marked] = await db.batch([
    db.execute(sql`
      delete from backlog_collaborator
      where backlog_id = ${backlogId} and user_id = ${userId} and left_at is null and blocked_at is null
      returning 1 as one
    `),
    db.execute(sql`
      update backlog_collaborator set left_at = now()
      where backlog_id = ${backlogId} and user_id = ${userId} and left_at is null and blocked_at is not null
      returning 1 as one
    `),
  ]);
  return rowsOf(deleted).length + rowsOf(marked).length > 0;
}

// ---------- songs ----------

export type AddSongResult =
  | { ok: true }
  | { ok: false; error: "not_found" }
  /** Not a song in the catalog (unknown id, or a film/series/album id). */
  | { ok: false; error: "song_not_found" }
  | { ok: false; error: AddRefusal; addedBy: PartyPerson | null }
  /** The INSERT wrote nothing and fresh state can't say why (C5). Logged. */
  | { ok: false; error: "conflict" };

/**
 * Put a song in the party. Order of checks (rules.ts `decideAdd`): member →
 * the id is a SONG → blocked → solo ver → duplicate ("Ya está, la puso
 * @ana" / "Ya la pusiste tú") → cap. The host has no cap.
 *
 * The write is ONE transaction that first locks the party row (`FOR
 * UPDATE`), so two adds by the same guest can't both pass the cap; the
 * INSERT re-checks membership, block, user block and cap inside its SELECT,
 * `ON CONFLICT (backlog_id, catalog_item_id) DO NOTHING` settles two people
 * adding the same song at once. The membership row is the HOST's
 * (`backlog_item.user_id = backlog.user_id`, the owner invariant); the
 * author goes to `party_song`. No `user_item` is created for anyone.
 */
export async function addSong(
  userId: string,
  backlogId: string,
  catalogItemId: string,
  paletteHex?: string[] | null,
): Promise<AddSongResult> {
  const access = await getPartyAccess(userId, backlogId);
  if (!access) return { ok: false, error: "not_found" };

  const [song] = await db
    .select({ id: catalogItems.id })
    .from(catalogItems)
    .where(and(eq(catalogItems.id, catalogItemId), eq(catalogItems.mediaType, "track")))
    .limit(1);
  if (!song) return { ok: false, error: "song_not_found" };

  const refusal = await refusalFor(userId, backlogId, catalogItemId, access);
  if (refusal) return refusal;

  const membershipId = randomUUID();
  await db.batch([
    db.execute(sql`select 1 from party where backlog_id = ${backlogId} for update`),
    db.execute(sql`
      insert into backlog_item (id, backlog_id, user_id, catalog_item_id, added_at)
      select ${membershipId}, b.id, b.user_id, ${catalogItemId}, now()
      from backlog b
      join party p on p.backlog_id = b.id
      where b.id = ${backlogId}
        and exists (select 1 from catalog_item ci where ci.id = ${catalogItemId} and ci.media_type = 'track')
        and (
          b.user_id = ${userId}
          or (
            exists (
              select 1 from backlog_collaborator c
              where c.backlog_id = b.id and c.user_id = ${userId} and c.blocked_at is null and c.left_at is null
            )
            and not exists (
              select 1 from user_block ub
              where (ub.blocker_user_id = ${userId} and ub.blocked_user_id = b.user_id)
                 or (ub.blocker_user_id = b.user_id and ub.blocked_user_id = ${userId})
            )
            and (
              p.per_guest_limit is null
              or (
                select count(*) from party_song s
                where s.backlog_id = b.id and s.added_by_user_id = ${userId}
              ) < p.per_guest_limit
            )
          )
        )
      on conflict (backlog_id, catalog_item_id) do nothing
    `),
    db.execute(sql`
      insert into party_song (backlog_item_id, backlog_id, added_by_user_id, added_at)
      select bi.id, bi.backlog_id, ${userId}, bi.added_at
      from backlog_item bi
      where bi.id = ${membershipId}
    `),
    db.execute(sql`
      update backlog set updated_at = now()
      where id = ${backlogId} and exists (select 1 from backlog_item bi where bi.id = ${membershipId})
    `),
  ]);

  const [written] = await db
    .select({ id: backlogItems.id })
    .from(backlogItems)
    .where(eq(backlogItems.id, membershipId))
    .limit(1);
  if (written) {
    await fillCatalogPalette(catalogItemId, paletteHex);
    return { ok: true };
  }
  // Lost a race (someone else put it, the host blocked us, our cap filled
  // from another device): say which, from fresh state. When fresh state
  // says "you may", nobody knows why — `conflict`, logged; never
  // `cap_reached` (a lie for the host and for an unlimited party).
  const fresh = await getPartyAccess(userId, backlogId);
  if (!fresh) return { ok: false, error: "not_found" };
  const existing = await findPartySong(backlogId, catalogItemId, userId);
  const outcome = lostAddOutcome(
    { role: fresh.role, blocked: fresh.blocked, perGuestLimit: fresh.perGuestLimit, mineCount: fresh.mineCount },
    existing ? { mine: existing.adderId === userId } : null,
  );
  if (outcome === "conflict") {
    console.error("[party] addSong: insert wrote nothing and fresh state allows it", {
      backlogId,
      catalogItemId,
      role: fresh.role,
    });
    return { ok: false, error: "conflict" };
  }
  return {
    ok: false,
    error: outcome,
    addedBy: outcome === "duplicate_other" ? (existing?.addedBy ?? null) : null,
  };
}

async function refusalFor(
  userId: string,
  backlogId: string,
  catalogItemId: string,
  access: NonNullable<Awaited<ReturnType<typeof getPartyAccess>>>,
): Promise<Extract<AddSongResult, { addedBy: PartyPerson | null }> | null> {
  const existing = await findPartySong(backlogId, catalogItemId, userId);
  const decision = decideAdd(
    {
      role: access.role,
      blocked: access.blocked,
      perGuestLimit: access.perGuestLimit,
      mineCount: access.mineCount,
    },
    existing ? { mine: existing.adderId === userId } : null,
  );
  if (decision.ok) return null;
  return {
    ok: false,
    error: decision.reason,
    addedBy: decision.reason === "duplicate_other" ? (existing?.addedBy ?? null) : null,
  };
}

export type RemoveSongResult =
  | { ok: true }
  | { ok: false; error: "not_found" }
  /** A guest removing someone else's song. */
  | { ok: false; error: "forbidden" }
  /** The DELETE removed nothing and fresh state can't say why (C5). Logged. */
  | { ok: false; error: "conflict" };

/**
 * Remove a song: the host any, a guest only their own (ALSO while blocked by
 * the host — C4). Idempotent: a song that isn't there is `ok` (it truly
 * isn't). The DELETE re-checks, in its WHERE, the host's ownership or the
 * guest's authorship + membership + no user block with the host (B6), and
 * RETURNS what it deleted: zero rows → re-evaluate from fresh state and say
 * why (`not_found` / `forbidden` / `conflict`), never a false `ok`.
 */
export async function removeSong(
  userId: string,
  backlogId: string,
  catalogItemId: string,
): Promise<RemoveSongResult> {
  const access = await getPartyAccess(userId, backlogId);
  if (!access) return { ok: false, error: "not_found" };
  const song = await findPartySong(backlogId, catalogItemId, userId);
  if (!song) return { ok: true };
  if (!canRemoveSong(access, song.adderId === userId)) return { ok: false, error: "forbidden" };

  const roleCheck =
    access.role === "host"
      ? sql`exists (select 1 from backlog b where b.id = bi.backlog_id and b.user_id = ${userId})`
      : sql`exists (select 1 from party_song ps where ps.backlog_item_id = bi.id and ps.added_by_user_id = ${userId})
          and exists (
            select 1 from backlog_collaborator c
            where c.backlog_id = bi.backlog_id and c.user_id = ${userId} and c.left_at is null
          )
          and not exists (
            select 1 from user_block ub join backlog b on b.id = bi.backlog_id
            where (ub.blocker_user_id = ${userId} and ub.blocked_user_id = b.user_id)
               or (ub.blocker_user_id = b.user_id and ub.blocked_user_id = ${userId})
          )`;
  const [done] = rowsOf<{ n: number }>(
    await db.execute(sql`
      with d as (
        delete from backlog_item bi
        where bi.id = ${song.backlogItemId} and bi.backlog_id = ${backlogId} and ${roleCheck}
        returning bi.backlog_id
      ), touched as (
        update backlog set updated_at = now() where id in (select backlog_id from d)
      )
      select count(*)::int as n from d
    `),
  );
  if (Number(done?.n ?? 0) > 0) return { ok: true };

  const fresh = await getPartyAccess(userId, backlogId);
  if (!fresh) return { ok: false, error: "not_found" };
  const still = await findPartySong(backlogId, catalogItemId, userId);
  if (!still) return { ok: true };
  if (!canRemoveSong(fresh, still.adderId === userId)) return { ok: false, error: "forbidden" };
  console.error("[party] removeSong: delete removed nothing and fresh state allows it", {
    backlogId,
    catalogItemId,
    role: fresh.role,
  });
  return { ok: false, error: "conflict" };
}

export type RemoveAndBlockResult =
  | { ok: true }
  | { ok: false; error: "not_found" }
  /** Only the host can block; and not the host's own song nor a deleted
   *  account's ("Puso alguien" with no one behind it). */
  | { ok: false; error: "not_blockable" }
  /** The statement removed nothing and fresh state can't say why (C5). */
  | { ok: false; error: "conflict" };

/**
 * "Quitar y bloquear a @x" (host): the song leaves the party AND its author
 * can no longer add songs (still a member: still SEES the party, may remove
 * their own — C4). The author is not notified. ONE statement: the block only
 * happens if the delete did. The author's OTHER songs stay (the host removes
 * them one by one if they want).
 *
 * An author who already LEFT (row deleted) still gets blocked: a row is
 * inserted with `blocked_at` AND `left_at`, so they stay out and, if they
 * come back through the link, come back blocked (rules.ts `joinOutcome`).
 */
export async function removeSongAndBlockAuthor(
  userId: string,
  backlogId: string,
  catalogItemId: string,
): Promise<RemoveAndBlockResult> {
  const access = await getPartyAccess(userId, backlogId);
  if (!access || access.role !== "host") return { ok: false, error: "not_found" };
  const song = await findPartySong(backlogId, catalogItemId, userId);
  if (!song) return { ok: false, error: "not_found" };
  if (
    !canBlockAuthor(access.role, {
      exists: song.adderId !== null,
      isHost: song.adderId === access.hostId,
    }) ||
    song.adderId === null
  ) {
    return { ok: false, error: "not_blockable" };
  }
  const authorId = song.adderId;
  const [done] = rowsOf<{ removed: number; blocked: number }>(
    await db.execute(sql`
      with d as (
        delete from backlog_item bi
        where bi.id = ${song.backlogItemId}
          and bi.backlog_id = ${backlogId}
          and exists (select 1 from backlog b where b.id = ${backlogId} and b.user_id = ${userId})
        returning bi.backlog_id
      ), blk as (
        insert into backlog_collaborator (backlog_id, user_id, created_at, blocked_at, left_at)
        select d.backlog_id, ${authorId}, now(), now(), now() from d where ${authorId} <> ${userId}
        on conflict (backlog_id, user_id) do update
          set blocked_at = coalesce(backlog_collaborator.blocked_at, excluded.blocked_at)
        returning 1 as one
      ), touched as (
        update backlog set updated_at = now() where id in (select backlog_id from d)
      )
      select (select count(*)::int from d) as removed, (select count(*)::int from blk) as blocked
    `),
  );
  if (Number(done?.removed ?? 0) > 0) {
    if (Number(done?.blocked ?? 0) === 0) {
      console.error("[party] removeSongAndBlockAuthor: song removed but no block written", { backlogId, catalogItemId });
    }
    return { ok: true };
  }
  const fresh = await getPartyAccess(userId, backlogId);
  if (!fresh || fresh.role !== "host") return { ok: false, error: "not_found" };
  if (!(await findPartySong(backlogId, catalogItemId, userId))) return { ok: false, error: "not_found" };
  console.error("[party] removeSongAndBlockAuthor: delete removed nothing and fresh state allows it", {
    backlogId,
    catalogItemId,
  });
  return { ok: false, error: "conflict" };
}

/** "Desbloquear" (host), by the opaque `guestRef` from `blockedGuests`.
 *  False = not the host / no blocked guest with that ref. */
export async function unblockGuest(userId: string, backlogId: string, guestRef: string): Promise<boolean> {
  const access = await getPartyAccess(userId, backlogId);
  if (!access || access.role !== "host") return false;
  const blocked = await db
    .select({ userId: backlogCollaborators.userId, leftAt: backlogCollaborators.leftAt })
    .from(backlogCollaborators)
    .where(and(eq(backlogCollaborators.backlogId, backlogId), isNotNull(backlogCollaborators.blockedAt)));
  const target = blocked.find((b) => guestRefOf(backlogId, b.userId) === guestRef);
  if (!target) return false;
  const isTarget = and(
    eq(backlogCollaborators.backlogId, backlogId),
    eq(backlogCollaborators.userId, target.userId),
    isNotNull(backlogCollaborators.blockedAt),
    sql`exists (select 1 from backlog b where b.id = ${backlogId} and b.user_id = ${userId})`,
  );
  // A blocked guest who had LEFT: unblocking just lets them go (the row
  // only existed to keep the block) — they can come back with a link.
  const changed = target.leftAt
    ? await db.delete(backlogCollaborators).where(isTarget).returning({ userId: backlogCollaborators.userId })
    : await db
        .update(backlogCollaborators)
        .set({ blockedAt: null })
        .where(isTarget)
        .returning({ userId: backlogCollaborators.userId });
  return changed.length > 0;
}

/** Palette of a song's cover, filled on-device while VIEWING the party (the
 *  aura). Members only and not blocked; the song must be in THIS party.
 *  First writer wins (`fillCatalogPalette`). */
export async function fillPartySongPalette(
  userId: string,
  backlogId: string,
  catalogItemId: string,
  paletteHex: string[],
): Promise<boolean> {
  const access = await getPartyAccess(userId, backlogId);
  // A guest the host blocked writes nothing to the party anymore — not even
  // the shared palette cache (security B7).
  if (!access || access.blocked) return false;
  const song = await findPartySong(backlogId, catalogItemId, userId);
  if (!song) return false;
  await fillCatalogPalette(catalogItemId, paletteHex);
  return true;
}

/** Postgres SQLSTATE of a driver error (walks `cause`). */
function sqlStateOf(err: unknown): string | null {
  for (let e: unknown = err, i = 0; e && i < 4; e = (e as { cause?: unknown }).cause, i++) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
  }
  return null;
}

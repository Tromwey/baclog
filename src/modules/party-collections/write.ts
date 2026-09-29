import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
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
import { assertPartyLive } from "./errors";
import { findPartySong, getActiveInvite, resolveInviteToken, rowsOf } from "./queries";
import {
  DEFAULT_PER_GUEST_LIMIT,
  canBlockAuthor,
  canRemoveSong,
  decideAdd,
  guestRefOf,
  inviteUrl,
  newInviteToken,
  partyNameSchema,
  perGuestLimitSchema,
  type AddRefusal,
} from "./rules";
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

/**
 * New party: a PRIVATE backlog (is_public = show_on_profile = false: a party
 * is never on /u/** nor in any feed), its `party` row, and its first invite
 * link — one transaction. Returns the id and the link token.
 */
export async function createParty(
  userId: string,
  input: CreatePartyInput,
): Promise<{ backlogId: string; invite: PartyInvite }> {
  assertPartyLive();
  const name = partyNameSchema.parse(input.name);
  const perGuestLimit = perGuestLimitSchema.parse(
    input.perGuestLimit === undefined ? DEFAULT_PER_GUEST_LIMIT : input.perGuestLimit,
  );
  const backlogId = randomUUID();
  const token = newInviteToken();
  const now = new Date();
  await db.batch([
    db.insert(backlogs).values({
      id: backlogId,
      userId,
      name,
      vibe: null,
      isPublic: false,
      showOnProfile: false,
      createdAt: now,
      updatedAt: now,
    }),
    db.insert(parties).values({ backlogId, perGuestLimit, createdAt: now }),
    db.insert(partyInvites).values({ backlogId, token, createdAt: now }),
  ]);
  return { backlogId, invite: { active: true, token, url: inviteUrl(token), createdAt: now } };
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
  assertPartyLive();
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

/**
 * "Crear link nuevo": revoke the active link (if any) and mint a new one —
 * one transaction; the old link stops working at once, members stay.
 * Null = not the host / not a party.
 */
export async function rotateInvite(userId: string, backlogId: string): Promise<PartyInvite | null> {
  const access = await getPartyAccess(userId, backlogId);
  if (!access || access.role !== "host") return null;
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
      return getActiveInvite(backlogId);
    } catch (err) {
      // Two rotations racing trip the one-active-link index (23505): the
      // loser retries once on top of the winner's link.
      if (attempt === 0 && sqlStateOf(err) === "23505") continue;
      throw err;
    }
  }
  return getActiveInvite(backlogId);
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
  assertPartyLive();
  const target = await resolveInviteToken(token);
  if (!target) return { ok: false, error: "invalid_link" };

  const [me] = await db
    .select({ name: users.name, isMinor: users.isMinor })
    .from(users)
    .where(sql`${users}.${sql.identifier("id")} = ${userId}`)
    .limit(1);
  if (!me || me.isMinor) return { ok: false, error: "invalid_link" };
  if (!me.name) return { ok: false, error: "onboarding_required" };

  if (target.hostId === userId) {
    return { ok: true, backlogId: target.backlogId, joined: "host", blocked: false };
  }
  // Insert only while the link is STILL active and no user block exists with
  // the host (either direction) — same statement, so a revoke or a block
  // racing the join wins.
  const inserted = rowsOf(
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
      on conflict (backlog_id, user_id) do nothing
      returning backlog_id
    `),
  );
  if (inserted.length > 0) {
    return { ok: true, backlogId: target.backlogId, joined: "new", blocked: false };
  }
  const access = await getPartyAccess(userId, target.backlogId);
  if (!access) return { ok: false, error: "invalid_link" };
  return { ok: true, backlogId: target.backlogId, joined: "already", blocked: access.blocked };
}

// ---------- songs ----------

export type AddSongResult =
  | { ok: true }
  | { ok: false; error: "not_found" }
  /** Not a song in the catalog (unknown id, or a film/series/album id). */
  | { ok: false; error: "song_not_found" }
  | { ok: false; error: AddRefusal; addedBy: PartyPerson | null };

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
              where c.backlog_id = b.id and c.user_id = ${userId} and c.blocked_at is null
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
  // from another device): say which, from fresh state.
  const fresh = await getPartyAccess(userId, backlogId);
  if (!fresh) return { ok: false, error: "not_found" };
  return (
    (await refusalFor(userId, backlogId, catalogItemId, fresh)) ?? {
      ok: false,
      error: "cap_reached",
      addedBy: null,
    }
  );
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
  /** A guest removing someone else's song, or a blocked guest. */
  | { ok: false; error: "forbidden" };

/**
 * Remove a song: the host any, a guest only their own (not while blocked).
 * Idempotent: a song that isn't there is `ok`. The DELETE re-checks the
 * guest's authorship and block inside its WHERE.
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

  const guestCheck =
    access.role === "host"
      ? sql`true`
      : sql`exists (select 1 from party_song ps where ps.backlog_item_id = bi.id and ps.added_by_user_id = ${userId})
          and exists (select 1 from backlog_collaborator c where c.backlog_id = bi.backlog_id and c.user_id = ${userId} and c.blocked_at is null)`;
  await db.batch([
    db.execute(sql`
      delete from backlog_item bi
      where bi.id = ${song.backlogItemId} and bi.backlog_id = ${backlogId} and ${guestCheck}
    `),
    db.execute(sql`update backlog set updated_at = now() where id = ${backlogId}`),
  ]);
  return { ok: true };
}

export type RemoveAndBlockResult =
  | { ok: true }
  | { ok: false; error: "not_found" }
  /** Only the host can block; and not the host's own song nor a deleted
   *  account's ("Puso alguien" with no one behind it). */
  | { ok: false; error: "not_blockable" };

/**
 * "Quitar y bloquear a @x" (host): the song leaves the party AND its author
 * can no longer add or remove songs (still a member: still SEES the party).
 * The author is not notified. One transaction. The author's OTHER songs
 * stay (the host removes them one by one if they want).
 */
export async function removeSongAndBlockAuthor(
  userId: string,
  backlogId: string,
  catalogItemId: string,
): Promise<RemoveAndBlockResult> {
  const access = await getPartyAccess(userId, backlogId);
  if (!access) return { ok: false, error: "not_found" };
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
  await db.batch([
    db.execute(sql`
      delete from backlog_item bi
      where bi.id = ${song.backlogItemId}
        and exists (select 1 from backlog b where b.id = ${backlogId} and b.user_id = ${userId})
    `),
    db
      .update(backlogCollaborators)
      .set({ blockedAt: new Date() })
      .where(
        and(
          eq(backlogCollaborators.backlogId, backlogId),
          eq(backlogCollaborators.userId, authorId),
          isNull(backlogCollaborators.blockedAt),
          sql`exists (select 1 from backlog b where b.id = ${backlogId} and b.user_id = ${userId})`,
        ),
      ),
    db.execute(sql`update backlog set updated_at = now() where id = ${backlogId} and user_id = ${userId}`),
  ]);
  return { ok: true };
}

/** "Desbloquear" (host), by the opaque `guestRef` from `blockedGuests`.
 *  False = not the host / no blocked guest with that ref. */
export async function unblockGuest(userId: string, backlogId: string, guestRef: string): Promise<boolean> {
  const access = await getPartyAccess(userId, backlogId);
  if (!access || access.role !== "host") return false;
  const blocked = await db
    .select({ userId: backlogCollaborators.userId })
    .from(backlogCollaborators)
    .where(and(eq(backlogCollaborators.backlogId, backlogId), isNotNull(backlogCollaborators.blockedAt)));
  const target = blocked.find((b) => guestRefOf(backlogId, b.userId) === guestRef);
  if (!target) return false;
  await db
    .update(backlogCollaborators)
    .set({ blockedAt: null })
    .where(and(eq(backlogCollaborators.backlogId, backlogId), eq(backlogCollaborators.userId, target.userId)));
  return true;
}

/** Palette of a song's cover, filled on-device while VIEWING the party (the
 *  aura). Members only; the song must be in THIS party. First writer wins
 *  (`fillCatalogPalette`). */
export async function fillPartySongPalette(
  userId: string,
  backlogId: string,
  catalogItemId: string,
  paletteHex: string[],
): Promise<boolean> {
  const access = await getPartyAccess(userId, backlogId);
  if (!access) return false;
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

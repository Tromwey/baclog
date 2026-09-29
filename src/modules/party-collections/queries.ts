import "server-only";
import { and, asc, eq, inArray, isNotNull, isNull, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  backlogCollaborators,
  backlogItems,
  backlogs,
  catalogItems,
  parties,
  partyInvites,
  partySongs,
  users,
} from "@/db/schema";
import { songFactsOf } from "@/modules/catalog/song-map";
import { notBlockedWith } from "@/modules/social/block-gate";
import { getPartyAccess, type PartyAccess } from "./access";
import { assertPartyLive } from "./errors";
import { MIGRATION_0033_LIVE } from "./live";
import {
  canAddNow,
  canBlockAuthor,
  canRemoveSong,
  guestRefOf,
  inviteUrl,
  parseInviteToken,
  remainingFor,
} from "./rules";
import type {
  InvitePreview,
  PartyBlockedGuest,
  PartyCard,
  PartyContributor,
  PartyDetail,
  PartyInvite,
  PartyPerson,
  PartyRole,
  PartySong,
  PartySummary,
} from "./types";

/**
 * Colecciones de fiesta — every READ. Cross-user by nature (a party shows
 * other people's songs and names), so the posture of `social/queries.ts`:
 *   - who may read is decided first (`getPartyAccess` for members; an ACTIVE
 *     invite token for the landing/summary — the link is the secret);
 *   - every other person is named only through `personGate` (INSIDE the
 *     query: `is_public AND username IS NOT NULL`, plus `notBlockedWith` the
 *     viewer when there is one) with a whitelist of fields (handle, name,
 *     image); otherwise null = "alguien";
 *   - user ids are read to group/compare and never returned.
 */

/** The identity gate for a joined `user` alias, as a JOIN condition. */
function personGate(
  u: { id: AnyColumn; isPublic: AnyColumn; username: AnyColumn },
  viewerId: string | null,
): SQL {
  return and(
    eq(u.isPublic, true),
    isNotNull(u.username),
    viewerId ? notBlockedWith(viewerId, u.id) : undefined,
  ) as SQL;
}

function personOf(r: { handle: string | null; name: string | null; image: string | null }): PartyPerson | null {
  return r.handle ? { handle: r.handle, name: r.name, avatarUrl: r.image } : null;
}

// ---------- songs (shared by the member view and the landing) ----------

interface SongRow {
  titleId: string;
  title: string;
  byline: string | null;
  posterUrl: string | null;
  paletteHex: string[] | null;
  raw: unknown;
  addedAt: Date;
  adderId: string | null;
  handle: string | null;
  name: string | null;
  image: string | null;
}

async function loadSongRows(backlogId: string, viewerId: string | null): Promise<SongRow[]> {
  const adder = alias(users, "adder");
  return db
    .select({
      titleId: catalogItems.id,
      title: catalogItems.title,
      byline: catalogItems.byline,
      posterUrl: catalogItems.posterUrl,
      paletteHex: catalogItems.paletteHex,
      raw: catalogItems.raw,
      addedAt: partySongs.addedAt,
      adderId: partySongs.addedByUserId,
      handle: adder.username,
      name: adder.name,
      image: adder.image,
    })
    .from(partySongs)
    .innerJoin(backlogItems, eq(backlogItems.id, partySongs.backlogItemId))
    .innerJoin(catalogItems, eq(catalogItems.id, backlogItems.catalogItemId))
    .leftJoin(adder, and(eq(adder.id, partySongs.addedByUserId), personGate(adder, viewerId)))
    .where(eq(partySongs.backlogId, backlogId))
    .orderBy(asc(partySongs.addedAt), asc(partySongs.backlogItemId));
}

interface SongCtx {
  viewerId: string | null;
  hostId: string;
  /** Null for an anonymous / non-member viewer (the landing). */
  access: Pick<PartyAccess, "role" | "blocked"> | null;
}

function toSong(r: SongRow, ctx: SongCtx): PartySong {
  const mine = ctx.viewerId !== null && r.adderId === ctx.viewerId;
  const facts = songFactsOf(r.raw);
  return {
    titleId: r.titleId,
    title: r.title,
    artist: r.byline,
    album: facts.album,
    artworkUrl: r.posterUrl,
    previewUrl: facts.previewUrl,
    durationMs: facts.durationMs,
    appleMusicUrl: facts.appleMusicUrl,
    paletteHex: r.paletteHex ?? null,
    addedAt: r.addedAt,
    addedBy: personOf(r),
    mine,
    byHost: r.adderId !== null && r.adderId === ctx.hostId,
    canRemove: ctx.access ? canRemoveSong(ctx.access, mine) : false,
    canBlockAuthor: ctx.access
      ? canBlockAuthor(ctx.access.role, {
          exists: r.adderId !== null,
          isHost: r.adderId === ctx.hostId,
        })
      : false,
  };
}

/**
 * "Quién puso qué": named people by song count (ties: who put first), then
 * ONE anonymous bucket for everyone unnamed (private, no handle, blocked,
 * deleted). The viewer's own line is always `isYou` (named or not).
 */
function contributorsOf(rows: SongRow[], viewerId: string | null): PartyContributor[] {
  const named = new Map<string, PartyContributor & { first: number }>();
  let you: (PartyContributor & { first: number }) | null = null;
  let anon = 0;
  rows.forEach((r, i) => {
    if (viewerId && r.adderId === viewerId) {
      you ??= { person: personOf(r), isYou: true, songCount: 0, first: i };
      you.songCount += 1;
      return;
    }
    const p = personOf(r);
    if (!p || r.adderId === null) {
      anon += 1;
      return;
    }
    const entry = named.get(r.adderId) ?? { person: p, isYou: false, songCount: 0, first: i };
    entry.songCount += 1;
    named.set(r.adderId, entry);
  });
  const list = [...named.values(), ...(you ? [you] : [])].sort(
    (a, b) => b.songCount - a.songCount || a.first - b.first,
  );
  const out: PartyContributor[] = list.map(({ person, isYou, songCount }) => ({ person, isYou, songCount }));
  if (anon > 0) out.push({ person: null, isYou: false, songCount: anon });
  return out;
}

// ---------- small shared reads ----------

async function hostPerson(hostId: string, viewerId: string | null): Promise<PartyPerson | null> {
  const [row] = await db
    .select({ handle: users.username, name: users.name, image: users.image })
    .from(users)
    .where(
      and(
        sql`${users}.${sql.identifier("id")} = ${hostId}`,
        eq(users.isPublic, true),
        isNotNull(users.username),
        viewerId && viewerId !== hostId
          ? notBlockedWith(viewerId, sql`${users}.${sql.identifier("id")}`)
          : undefined,
      ),
    )
    .limit(1);
  return row ? personOf(row) : null;
}

async function guestCountOf(backlogId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(backlogCollaborators)
    .where(and(eq(backlogCollaborators.backlogId, backlogId), isNull(backlogCollaborators.blockedAt)));
  return Number(row?.n ?? 0);
}

export async function getActiveInvite(backlogId: string): Promise<PartyInvite> {
  const [row] = await db
    .select({ token: partyInvites.token, createdAt: partyInvites.createdAt })
    .from(partyInvites)
    .where(and(eq(partyInvites.backlogId, backlogId), isNull(partyInvites.revokedAt)))
    .limit(1);
  if (!row) return { active: false, token: null, url: null, createdAt: null };
  return { active: true, token: row.token, url: inviteUrl(row.token), createdAt: row.createdAt };
}

async function blockedGuestsOf(backlogId: string, hostId: string): Promise<PartyBlockedGuest[]> {
  const guest = alias(users, "guest");
  const rows = await db
    .select({
      userId: backlogCollaborators.userId,
      blockedAt: backlogCollaborators.blockedAt,
      handle: guest.username,
      name: guest.name,
      image: guest.image,
    })
    .from(backlogCollaborators)
    .leftJoin(guest, and(eq(guest.id, backlogCollaborators.userId), personGate(guest, hostId)))
    .where(and(eq(backlogCollaborators.backlogId, backlogId), isNotNull(backlogCollaborators.blockedAt)))
    .orderBy(asc(backlogCollaborators.blockedAt));
  return rows.map((r) => ({
    guestRef: guestRefOf(backlogId, r.userId),
    person: personOf(r),
    blockedAt: r.blockedAt as Date,
  }));
}

// ---------- the member view ----------

/**
 * The party as its host or a member sees it (`/c/{id}`, `GET /api/v1/
 * parties/{id}`). Null = not a member / not a party / unknown — one answer.
 */
export async function getPartyDetail(viewerId: string, backlogId: string): Promise<PartyDetail | null> {
  const access = await getPartyAccess(viewerId, backlogId);
  if (!access) return null;
  const isHost = access.role === "host";
  const [rows, host, guestCount, invite, blockedGuests] = await Promise.all([
    loadSongRows(backlogId, viewerId),
    hostPerson(access.hostId, viewerId),
    guestCountOf(backlogId),
    isHost ? getActiveInvite(backlogId) : Promise.resolve(null),
    isHost ? blockedGuestsOf(backlogId, access.hostId) : Promise.resolve([]),
  ]);
  const ctx: SongCtx = { viewerId, hostId: access.hostId, access };
  const facts = {
    role: access.role,
    blocked: access.blocked,
    perGuestLimit: access.perGuestLimit,
    mineCount: access.mineCount,
  };
  return {
    id: access.backlogId,
    name: access.name,
    perGuestLimit: access.perGuestLimit,
    createdAt: access.createdAt,
    host,
    viewer: {
      role: access.role,
      blocked: access.blocked,
      mineCount: access.mineCount,
      remaining: remainingFor(facts),
      canAdd: canAddNow(facts),
    },
    songs: rows.map((r) => toSong(r, ctx)),
    contributors: contributorsOf(rows, viewerId),
    guestCount,
    invite,
    blockedGuests,
  };
}

// ---------- the invite landing (/f/{token}) ----------

interface InviteTarget {
  backlogId: string;
  name: string;
  hostId: string;
  perGuestLimit: number | null;
}

/** Resolve an ACTIVE invite token to its party. Null for malformed, unknown
 *  or revoked — indistinguishable on purpose. */
export async function resolveInviteToken(raw: unknown): Promise<InviteTarget | null> {
  if (!MIGRATION_0033_LIVE) return null;
  const token = parseInviteToken(raw);
  if (!token) return null;
  const [row] = await db
    .select({
      backlogId: backlogs.id,
      name: backlogs.name,
      hostId: backlogs.userId,
      perGuestLimit: parties.perGuestLimit,
    })
    .from(partyInvites)
    .innerJoin(backlogs, eq(backlogs.id, partyInvites.backlogId))
    .innerJoin(parties, eq(parties.backlogId, backlogs.id))
    .where(and(eq(partyInvites.token, token), isNull(partyInvites.revokedAt)))
    .limit(1);
  return row ?? null;
}

/**
 * /f/{token} and `GET /api/v1/invites/{token}` — the party as anyone holding
 * an ACTIVE link sees it (signed in or not): name, host, songs with who put
 * each, contributors. Null (= "este link ya no funciona") when the token is
 * malformed, unknown or revoked, AND when a signed-in viewer has a user block
 * with the host in either direction (same answer, no oracle). Songs never
 * carry `canRemove`/`canBlockAuthor` here (the member page does that).
 */
export async function getInvitePreview(
  token: string,
  viewerId: string | null,
): Promise<InvitePreview | null> {
  const target = await resolveInviteToken(token);
  if (!target) return null;
  const blockedWithHost =
    viewerId && viewerId !== target.hostId ? await userBlockBetween(viewerId, target.hostId) : false;
  if (blockedWithHost) return null;

  const [rows, host, guestCount, access] = await Promise.all([
    loadSongRows(target.backlogId, viewerId),
    hostPerson(target.hostId, viewerId),
    guestCountOf(target.backlogId),
    viewerId ? getPartyAccess(viewerId, target.backlogId) : Promise.resolve(null),
  ]);
  const ctx: SongCtx = { viewerId, hostId: target.hostId, access: null };
  return {
    token: token,
    party: {
      id: target.backlogId,
      name: target.name,
      perGuestLimit: target.perGuestLimit,
      host,
      songs: rows.map((r) => toSong(r, ctx)),
      contributors: contributorsOf(rows, viewerId),
      guestCount,
    },
    viewer: viewerId
      ? {
          role: access?.role ?? null,
          joined: access !== null,
          blocked: access?.blocked ?? false,
        }
      : null,
  };
}

async function userBlockBetween(a: string, b: string): Promise<boolean> {
  const rows = await db.execute(
    sql`select 1 as one from user_block ub where (ub.blocker_user_id = ${a} and ub.blocked_user_id = ${b}) or (ub.blocker_user_id = ${b} and ub.blocked_user_id = ${a}) limit 1`,
  );
  return rowsOf(rows).length > 0;
}

/** `db.execute` rows across drivers (neon-http returns `{ rows }`). */
export function rowsOf<T = Record<string, unknown>>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  const r = (res as { rows?: unknown }).rows;
  return Array.isArray(r) ? (r as T[]) : [];
}

// ---------- /party's line ----------

/**
 * For the /party invitation: "8 canciones · @ana, @rodri y 2 más ya están
 * dentro" (format it with `presenceLine`, rules.ts). ANONYMOUS read keyed by
 * an ACTIVE invite token (null otherwise — a revoked link shows nothing).
 * Whitelist: party name, counts, up to 2 PUBLIC guest handles (join order),
 * up to 5 artwork URLs. No user ids, no private names.
 */
export async function getPartySummaryByToken(token: string): Promise<PartySummary | null> {
  const target = await resolveInviteToken(token);
  if (!target) return null;
  const guest = alias(users, "guest");
  const [counts, named, art] = await Promise.all([
    db
      .select({
        songs: sql<number>`(select count(*)::int from party_song ps where ps.backlog_id = ${target.backlogId})`,
        guests: sql<number>`(select count(*)::int from backlog_collaborator c where c.backlog_id = ${target.backlogId} and c.blocked_at is null)`,
      })
      .from(sql`(select 1) as one`),
    db
      .select({ handle: guest.username })
      .from(backlogCollaborators)
      .innerJoin(guest, and(eq(guest.id, backlogCollaborators.userId), personGate(guest, null)))
      .where(and(eq(backlogCollaborators.backlogId, target.backlogId), isNull(backlogCollaborators.blockedAt)))
      .orderBy(asc(backlogCollaborators.createdAt))
      .limit(2),
    db
      .select({ posterUrl: catalogItems.posterUrl })
      .from(partySongs)
      .innerJoin(backlogItems, eq(backlogItems.id, partySongs.backlogItemId))
      .innerJoin(catalogItems, eq(catalogItems.id, backlogItems.catalogItemId))
      .where(and(eq(partySongs.backlogId, target.backlogId), isNotNull(catalogItems.posterUrl)))
      .orderBy(asc(partySongs.addedAt))
      .limit(5),
  ]);
  const songCount = Number(counts[0]?.songs ?? 0);
  const guestCount = Number(counts[0]?.guests ?? 0);
  const handles = named.flatMap((n) => (n.handle ? [n.handle] : []));
  return {
    name: target.name,
    songCount,
    guestCount,
    named: handles,
    othersCount: Math.max(0, guestCount - handles.length),
    artworkUrls: art.flatMap((a) => (a.posterUrl ? [a.posterUrl] : [])),
  };
}

// ---------- lists ----------

/**
 * Every party the user hosts or joined (blocked included — they still see
 * it), most recently touched first. For "Tus colecciones · De fiesta" and
 * `GET /api/v1/parties`. Two queries.
 */
export async function listPartiesForUser(userId: string): Promise<PartyCard[]> {
  assertPartyLive();
  const host = alias(users, "host");
  const rows = await db
    .select({
      id: backlogs.id,
      name: backlogs.name,
      hostId: backlogs.userId,
      updatedAt: backlogs.updatedAt,
      perGuestLimit: parties.perGuestLimit,
      handle: host.username,
      hostName: host.name,
      image: host.image,
    })
    .from(backlogs)
    .innerJoin(parties, eq(parties.backlogId, backlogs.id))
    .leftJoin(host, and(eq(host.id, backlogs.userId), personGate(host, userId)))
    .where(
      or(
        eq(backlogs.userId, userId),
        sql`exists (select 1 from backlog_collaborator c where c.backlog_id = ${backlogs.id} and c.user_id = ${userId})`,
      ),
    )
    .orderBy(sql`${backlogs.updatedAt} desc`);
  if (rows.length === 0) return [];

  const songs = await db
    .select({
      backlogId: partySongs.backlogId,
      adderId: partySongs.addedByUserId,
      posterUrl: catalogItems.posterUrl,
      paletteHex: catalogItems.paletteHex,
    })
    .from(partySongs)
    .innerJoin(backlogItems, eq(backlogItems.id, partySongs.backlogItemId))
    .innerJoin(catalogItems, eq(catalogItems.id, backlogItems.catalogItemId))
    .where(inArray(partySongs.backlogId, rows.map((r) => r.id)))
    .orderBy(asc(partySongs.addedAt), asc(partySongs.backlogItemId));

  const byParty = new Map<string, typeof songs>();
  for (const s of songs) {
    const list = byParty.get(s.backlogId) ?? [];
    list.push(s);
    byParty.set(s.backlogId, list);
  }
  return rows.map((r) => {
    const list = byParty.get(r.id) ?? [];
    const people = new Set(list.map((s) => s.adderId ?? "∅"));
    const role: PartyRole = r.hostId === userId ? "host" : "guest";
    return {
      id: r.id,
      name: r.name,
      role,
      perGuestLimit: r.perGuestLimit,
      songCount: list.length,
      peopleCount: people.size,
      host: r.handle ? { handle: r.handle, name: r.hostName, avatarUrl: r.image } : null,
      artworkUrls: list.slice(0, 3).map((s) => s.posterUrl),
      paletteHex: list[0]?.paletteHex ?? null,
      updatedAt: r.updatedAt,
    };
  });
}

// ---------- one song of a party (for writes and the duplicate message) ----------

export interface PartySongRef {
  backlogItemId: string;
  adderId: string | null;
  addedBy: PartyPerson | null;
}

/** The party's row for this song, with its author's gated identity. */
export async function findPartySong(
  backlogId: string,
  catalogItemId: string,
  viewerId: string,
): Promise<PartySongRef | null> {
  const adder = alias(users, "adder");
  const [row] = await db
    .select({
      backlogItemId: backlogItems.id,
      adderId: partySongs.addedByUserId,
      handle: adder.username,
      name: adder.name,
      image: adder.image,
    })
    .from(backlogItems)
    .innerJoin(partySongs, eq(partySongs.backlogItemId, backlogItems.id))
    .leftJoin(adder, and(eq(adder.id, partySongs.addedByUserId), personGate(adder, viewerId)))
    .where(and(eq(backlogItems.backlogId, backlogId), eq(backlogItems.catalogItemId, catalogItemId)))
    .limit(1);
  return row ? { backlogItemId: row.backlogItemId, adderId: row.adderId, addedBy: personOf(row) } : null;
}

/** The party's rows for a set of songs (search annotation). */
export async function findPartySongs(
  backlogId: string,
  catalogItemIds: string[],
  viewerId: string,
): Promise<Map<string, PartySongRef>> {
  if (catalogItemIds.length === 0) return new Map();
  const adder = alias(users, "adder");
  const rows = await db
    .select({
      catalogItemId: backlogItems.catalogItemId,
      backlogItemId: backlogItems.id,
      adderId: partySongs.addedByUserId,
      handle: adder.username,
      name: adder.name,
      image: adder.image,
    })
    .from(backlogItems)
    .innerJoin(partySongs, eq(partySongs.backlogItemId, backlogItems.id))
    .leftJoin(adder, and(eq(adder.id, partySongs.addedByUserId), personGate(adder, viewerId)))
    .where(and(eq(backlogItems.backlogId, backlogId), inArray(backlogItems.catalogItemId, catalogItemIds)));
  return new Map(
    rows.map((r) => [
      r.catalogItemId,
      { backlogItemId: r.backlogItemId, adderId: r.adderId, addedBy: personOf(r) },
    ]),
  );
}

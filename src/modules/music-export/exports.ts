import "server-only";
import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { checkRateLimit } from "@/authz/api";
import { db } from "@/db";
import { catalogItems, partyExportItems, partyExports } from "@/db/schema";
import { searchTitle } from "@/modules/links/resolvers/match";
import { getPartyDetail } from "@/modules/party-collections/queries";
import type { PartySong } from "@/modules/party-collections/types";
import { appleCatalogIsrcs } from "./apple-music";
import { tidalOAuthConfig, type TidalOAuthConfig } from "./config";
import {
  assertMusicExportLive,
  MusicExportError,
  notConfigured,
  notConnected,
  playlistExists,
  serviceFailed,
  serviceRateLimited,
} from "./errors";
import { normalizeIsrc, pickTrackMatch } from "./match";
import { tidalIdempotencyKey } from "./pkce";
import {
  applePlaylistUrl,
  isTidalAuthRefusal,
  PARTY_NOT_FOUND_MESSAGE,
  planExport,
  reportItems,
  TIDAL_STEP_BATCH,
  tidalForbiddenMessage,
  type PlanItem,
} from "./rules";
import {
  tidalAddTracks,
  tidalCreatePlaylist,
  TidalHttpError,
  tidalPlaylistExists,
  tidalSearchTracks,
  tidalTracksByIsrc,
} from "./tidal-api";
import { describe, disconnectTidal, getTidalAccess, isTidalConnected, type TidalAccess } from "./tidal-auth";
import type { ExportSong, ExportState, MusicProvider } from "./types";

/**
 * "Llévala a otra app" — the export of ONE party by ONE user to ONE service.
 *
 * Who may export: anyone `getPartyAccess` lets see the party — the host and
 * every member, INCLUDING a guest the host blocked in this party (a block
 * stops adding songs, not reading them; exporting only reads). A user with
 * a GLOBAL block with the host has no access at all (contract C2) → the
 * same 404. Every read goes through `getPartyDetail`, so the songs, their
 * order and "Puso @x" carry the party's identity gate unchanged.
 *
 * What is exported: the party's CURRENT songs in playlist order. Re-running
 * adds only what the service doesn't have yet (items), creates the remote
 * playlist ONCE (`remote_playlist_id`, TIDAL `Idempotency-Key` = export id +
 * generation) and retries the `missing` ones on every "start". Songs removed
 * from the party stay in the remote playlist (we never delete there).
 *
 * TIDAL runs HERE, one batch per `stepTidalExport` call (the client loops
 * and draws the progress). Apple Music runs on the CLIENT (MusicKit) and
 * reports back with `reportAppleMusicExport`.
 *
 * "The remote playlist is gone" is only ever concluded from a `GET
 * /playlists/{id}` 404 (an add can 404 because of ONE track id), and the
 * new generation it triggers is capped at one per 10 minutes
 * (`restartGeneration`) so a flaky TIDAL can't make us spray playlists.
 */

const LEASE_MS = 120_000;
/** Per user, per instance (authz/api.ts `checkRateLimit`): a step costs up to
 *  ~20 upstream calls, a start one Apple call. Frena un bucle desbocado. */
const STEPS_PER_MINUTE = 30;
const STARTS_PER_MINUTE = 20;
/** Apple Music reports: the web client reports every ~5 songs and backs off on 429. */
const REPORTS_PER_MINUTE = 30;
/** A new TIDAL generation (new playlist) at most this often per export. */
const REGEN_COOLDOWN_MS = 10 * 60 * 1000;

function limit(key: string, perMinute: number): void {
  const rl = checkRateLimit(key, perMinute);
  if (!rl.ok) {
    throw new MusicExportError(
      "rate_limited",
      "rate_limited",
      "Demasiadas peticiones seguidas. Espera un momento e inténtalo de nuevo.",
      rl.retryAfterSeconds,
    );
  }
}
const ISRC_RECHECK_MS = 30 * 24 * 60 * 60 * 1000;
const SEARCH_CONCURRENCY = 3;
const FALLBACK_COUNTRY = "MX";

// ---------- reads ----------

interface PartyForExport {
  name: string;
  songs: PartySong[];
}

async function partyFor(userId: string, backlogId: string): Promise<PartyForExport> {
  const party = await getPartyDetail(userId, backlogId);
  if (!party) throw new MusicExportError("not_found", "not_found", PARTY_NOT_FOUND_MESSAGE);
  return { name: party.name, songs: party.songs };
}

type ExportRow = typeof partyExports.$inferSelect;

async function findExport(userId: string, backlogId: string, provider: MusicProvider): Promise<ExportRow | null> {
  const [row] = await db
    .select()
    .from(partyExports)
    .where(and(eq(partyExports.backlogId, backlogId), eq(partyExports.userId, userId), eq(partyExports.provider, provider)))
    .limit(1);
  return row ?? null;
}

async function upsertExport(userId: string, backlogId: string, provider: MusicProvider): Promise<ExportRow> {
  const [row] = await db
    .insert(partyExports)
    .values({ backlogId, userId, provider })
    .onConflictDoUpdate({
      target: [partyExports.backlogId, partyExports.userId, partyExports.provider],
      set: { updatedAt: new Date() },
    })
    .returning();
  return row;
}

async function loadItems(exportId: string): Promise<PlanItem[]> {
  const rows = await db
    .select({ titleId: partyExportItems.catalogItemId, outcome: partyExportItems.outcome })
    .from(partyExportItems)
    .where(eq(partyExportItems.exportId, exportId));
  return rows.map((r) => ({ titleId: r.titleId, outcome: r.outcome === "added" ? "added" : "missing" }));
}

async function writeItems(
  exportId: string,
  items: readonly { titleId: string; outcome: "added" | "missing"; remoteTrackId?: string | null }[],
): Promise<void> {
  if (items.length === 0) return;
  await db
    .insert(partyExportItems)
    .values(
      items.map((i) => ({
        exportId,
        catalogItemId: i.titleId,
        outcome: i.outcome,
        remoteTrackId: i.remoteTrackId ?? null,
        updatedAt: new Date(),
      })),
    )
    .onConflictDoUpdate({
      target: [partyExportItems.exportId, partyExportItems.catalogItemId],
      // Once `added`, always `added`: it IS in the remote playlist.
      set: {
        outcome: sql`case when ${partyExportItems.outcome} = 'added' then 'added' else excluded.outcome end`,
        remoteTrackId: sql`coalesce(excluded.remote_track_id, ${partyExportItems.remoteTrackId})`,
        updatedAt: sql`excluded.updated_at`,
      },
    });
}

/** ISRC per song as cached on `catalog_item.raw._isrc` (null = unknown). */
async function cachedIsrcs(titleIds: readonly string[]): Promise<Map<string, { isrc: string | null; checkedAt: number | null }>> {
  const out = new Map<string, { isrc: string | null; checkedAt: number | null }>();
  if (titleIds.length === 0) return out;
  const rows = await db
    .select({
      id: catalogItems.id,
      isrc: sql<string | null>`${catalogItems.raw}->>'_isrc'`,
      checkedAt: sql<string | null>`${catalogItems.raw}->>'_isrc_at'`,
    })
    .from(catalogItems)
    .where(inArray(catalogItems.id, [...titleIds]));
  for (const r of rows) {
    const at = r.checkedAt ? Date.parse(r.checkedAt) : NaN;
    out.set(r.id, { isrc: normalizeIsrc(r.isrc), checkedAt: Number.isFinite(at) ? at : null });
  }
  return out;
}

/**
 * ISRCs for `songs`, asking Apple's catalog (one call, ≤ 300 ids) only for
 * the ones never checked (or checked > 30 days ago without a result), and
 * caching the answer on the song row (`raw._isrc`, `raw._isrc_at` — keys
 * with `_` are ours, state/data.md). Best effort: Apple down or not
 * configured = the ones we have (TIDAL then falls back to search).
 */
async function ensureIsrcs(songs: readonly PartySong[]): Promise<Map<string, string | null>> {
  const cached = await cachedIsrcs(songs.map((s) => s.titleId));
  const out = new Map<string, string | null>();
  const ask: PartySong[] = [];
  const now = Date.now();
  for (const s of songs) {
    const c = cached.get(s.titleId);
    out.set(s.titleId, c?.isrc ?? null);
    if (!c?.isrc && s.appleMusicId && (c?.checkedAt == null || now - c.checkedAt > ISRC_RECHECK_MS)) ask.push(s);
  }
  if (ask.length === 0) return out;
  let found: Map<string, string> | null;
  try {
    found = await appleCatalogIsrcs(ask.map((s) => s.appleMusicId as string));
  } catch (err) {
    console.warn(`[music-export] apple isrc lookup failed: ${err instanceof Error ? err.message : "error"}`);
    return out;
  }
  if (!found) return out;
  const stamp = new Date(now).toISOString();
  const writes = ask.map((s) => {
    const isrc = found.get(s.appleMusicId as string) ?? null;
    out.set(s.titleId, isrc);
    const patch = isrc ? { _isrc: isrc, _isrc_at: stamp } : { _isrc_at: stamp };
    return db
      .update(catalogItems)
      .set({ raw: sql`coalesce(${catalogItems.raw}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb` })
      .where(and(eq(catalogItems.id, s.titleId), eq(catalogItems.source, "itunes-track")));
  });
  try {
    const [first, ...rest] = writes;
    if (first) await db.batch([first, ...rest]);
  } catch (err) {
    // Cache only; the export goes on with what it has.
    console.warn(`[music-export] isrc cache write failed: ${err instanceof Error ? err.name : "error"}`);
  }
  return out;
}

function toExportSong(s: PartySong, state: ExportSong["state"], isrc: string | null): ExportSong {
  return {
    titleId: s.titleId,
    title: s.title,
    artist: s.artist,
    album: s.album,
    artworkUrl: s.artworkUrl,
    durationMs: s.durationMs,
    appleMusicId: s.appleMusicId,
    isrc,
    state,
    addedBy: s.addedBy,
    mine: s.mine,
  };
}

async function stateOf(
  provider: MusicProvider,
  party: PartyForExport,
  row: ExportRow | null,
  busy = false,
): Promise<ExportState> {
  const items = row ? await loadItems(row.id) : [];
  const plan = planExport(party.songs, items);
  const isrcs = await cachedIsrcs(party.songs.map((s) => s.titleId));
  const byId = new Map(plan.states.map((s) => [s.titleId, s.state]));
  const songs = party.songs.map((s) => toExportSong(s, byId.get(s.titleId) ?? "pending", isrcs.get(s.titleId)?.isrc ?? null));
  const next = songs.find((s) => s.state === "pending") ?? null;
  return {
    provider,
    playlistName: party.name,
    status: !row ? "idle" : plan.pending.length === 0 ? "done" : "in_progress",
    total: plan.total,
    exported: plan.exported,
    processed: plan.processed,
    current: row && next ? { titleId: next.titleId, title: next.title, artist: next.artist } : null,
    playlist: row?.remotePlaylistId ? { id: row.remotePlaylistId, url: row.remoteUrl } : null,
    missing: songs.filter((s) => s.state === "missing"),
    songs,
    busy,
  };
}

/** The export as it stands (no work). `idle` when never started. */
export async function getExportState(userId: string, backlogId: string, provider: MusicProvider): Promise<ExportState> {
  assertMusicExportLive();
  const party = await partyFor(userId, backlogId);
  return stateOf(provider, party, await findExport(userId, backlogId, provider));
}

/**
 * "Llévala a {svc}" / "Reintentar": creates or resumes the export and puts
 * the `missing` songs back in the queue. TIDAL needs a live link first
 * (409 `not_connected`). For Apple Music it also resolves ISRCs so the
 * client can find songs its storefront lists under another id.
 */
export async function startExport(userId: string, backlogId: string, provider: MusicProvider): Promise<ExportState> {
  assertMusicExportLive();
  limit(`music-export-start:${userId}`, STARTS_PER_MINUTE);
  if (provider === "tidal") {
    if (!tidalOAuthConfig()) throw notConfigured("tidal");
    if (!(await isTidalConnected(userId))) throw notConnected("tidal");
  }
  const party = await partyFor(userId, backlogId);
  let row = await upsertExport(userId, backlogId, provider);
  await db
    .delete(partyExportItems)
    .where(and(eq(partyExportItems.exportId, row.id), eq(partyExportItems.outcome, "missing")));
  if (provider === "apple_music") await ensureIsrcs(party.songs);
  if (provider === "tidal" && row.remotePlaylistId) row = await confirmTidalPlaylist(userId, party, row);
  return stateOf(provider, party, row);
}

/**
 * TIDAL "done" with a playlist on record: before answering `done` + "Abrir
 * en TIDAL", check the playlist still exists (GET). Gone → new generation
 * NOW, so the answer is `in_progress` (the client steps and rebuilds it)
 * instead of a dead link. Only when nothing is pending (otherwise the next
 * step finds out by itself). TIDAL flaky → answer what we have (logged);
 * a dropped link (`not_connected`) or the regen cap DO propagate.
 */
async function confirmTidalPlaylist(userId: string, party: PartyForExport, row: ExportRow): Promise<ExportRow> {
  const playlistId = row.remotePlaylistId;
  if (!playlistId) return row;
  if (planExport(party.songs, await loadItems(row.id)).pending.length > 0) return row;
  let exists: boolean;
  try {
    const access = await getTidalAccess(userId);
    exists = await withUserToken(userId, access, (token) => tidalPlaylistExists(token, playlistId));
  } catch (err) {
    if (err instanceof MusicExportError) throw err;
    console.warn(`[music-export] tidal playlist check failed: ${describe(err)}`);
    return row;
  }
  return exists ? row : restartGeneration(row.id);
}

/**
 * The remote TIDAL playlist is CONFIRMED gone (GET 404): forget it, clear
 * the items (the new one gets the whole party) and bump `generation` (new
 * idempotency key) — in ONE statement, and at most once per
 * `REGEN_COOLDOWN_MS`: a second "gone" within 10 minutes fails with
 * `service_failed` instead of creating playlist after playlist.
 */
async function restartGeneration(exportId: string): Promise<ExportRow> {
  // Both sides of the cooldown are the DB clock (`now()`): never compare a
  // `timestamp without time zone` written by SQL with one serialized from JS.
  const cooldown = `${Math.round(REGEN_COOLDOWN_MS / 1000)} seconds`;
  const res = await db.execute<{ n: number }>(sql`
    with bumped as (
      update party_export
         set remote_playlist_id = null, remote_url = null, generation = generation + 1,
             generation_bumped_at = now(), updated_at = now()
       where id = ${exportId}
         and (generation_bumped_at is null or generation_bumped_at < now() - ${cooldown}::interval)
      returning id
    ), cleared as (
      delete from party_export_item where export_id in (select id from bumped)
    )
    select count(*)::int as n from bumped`);
  if (Number(res.rows[0]?.n ?? 0) === 0) {
    console.warn("[music-export] tidal playlist vanished twice within 10 min: not recreating");
    throw new MusicExportError(
      "unavailable",
      "service_failed",
      "TIDAL no encuentra la playlist que acabamos de crear. Espera unos minutos y vuelve a intentarlo; tu colección sigue intacta en kura.",
    );
  }
  const [fresh] = await db.select().from(partyExports).where(eq(partyExports.id, exportId)).limit(1);
  if (!fresh) throw new MusicExportError("not_found", "not_found", PARTY_NOT_FOUND_MESSAGE);
  return fresh;
}

// ---------- TIDAL (server-side) ----------

function upstream(err: unknown): never {
  if (err instanceof MusicExportError) throw err;
  if (err instanceof TidalHttpError && err.status === 429) throw serviceRateLimited("tidal", err.retryAfterSeconds ?? 5);
  console.warn(`[music-export] tidal step failed: ${describe(err)}`);
  throw serviceFailed("tidal");
}

/** A catalog search that TIDAL refuses as a bad request = "not found" for that song. */
function isNoResult(err: unknown): boolean {
  return err instanceof TidalHttpError && (err.status === 400 || err.status === 404 || err.status === 422);
}

async function pool<T, R>(items: readonly T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

/** titleId → TIDAL track id (null = not on TIDAL / no confident match). */
async function matchOnTidal(
  cfg: TidalOAuthConfig,
  batch: readonly PartySong[],
  country: string,
): Promise<Map<string, string | null>> {
  const isrcs = await ensureIsrcs(batch);
  const wanted = [...new Set([...isrcs.values()].filter((x): x is string => Boolean(x)))];
  let byIsrc = new Map<string, string>();
  if (wanted.length > 0) {
    try {
      byIsrc = await tidalTracksByIsrc(cfg, wanted, country);
    } catch (err) {
      if (!isNoResult(err)) throw err;
    }
  }
  const out = new Map<string, string | null>();
  const rest: PartySong[] = [];
  for (const s of batch) {
    const isrc = isrcs.get(s.titleId);
    const hit = isrc ? byIsrc.get(isrc) : undefined;
    if (hit) out.set(s.titleId, hit);
    else rest.push(s);
  }
  const found = await pool(rest, SEARCH_CONCURRENCY, async (s) => {
    if (!s.artist) return null;
    const term = `${searchTitle(s.title) || s.title} ${s.artist}`;
    try {
      const candidates = await tidalSearchTracks(cfg, term, country);
      return pickTrackMatch({ title: s.title, artist: s.artist, durationMs: s.durationMs }, candidates)?.id ?? null;
    } catch (err) {
      if (isNoResult(err)) return null;
      throw err;
    }
  });
  rest.forEach((s, i) => out.set(s.titleId, found[i]));
  return out;
}

/**
 * Runs `fn` with the user's token. 401 → one forced refresh (and `access` is
 * updated in place, so the rest of the step uses the fresh token); 401 again
 * → the link is dead: dropped, "Conectar TIDAL". 403 → dropped ONLY when it
 * is about our access (`isTidalAuthRefusal`: an auth/scope `errors[].code`,
 * or the granted scopes lack `playlists.write`); any other 403 (terms,
 * quota…) keeps the link and fails the step with a message that says why.
 */
async function withUserToken<T>(userId: string, access: TidalAccess, fn: (token: string) => Promise<T>): Promise<T> {
  let err: unknown;
  try {
    return await fn(access.accessToken);
  } catch (first) {
    err = first;
  }
  if (err instanceof TidalHttpError && err.status === 401) {
    const fresh = await getTidalAccess(userId, true);
    Object.assign(access, fresh);
    try {
      return await fn(access.accessToken);
    } catch (again) {
      err = again;
    }
    if (err instanceof TidalHttpError && err.status === 401) {
      await disconnectTidal(userId);
      throw notConnected("tidal");
    }
  }
  if (err instanceof TidalHttpError && err.status === 403) {
    if (isTidalAuthRefusal(err.codes, access.scope)) {
      console.warn(`[music-export] tidal refused our access: ${describe(err)}`);
      await disconnectTidal(userId);
      throw notConnected("tidal");
    }
    console.warn(`[music-export] tidal forbade the write: ${describe(err)}`);
    throw new MusicExportError("unavailable", "service_failed", tidalForbiddenMessage(err.codes));
  }
  throw err;
}

/**
 * One batch of the TIDAL export (≤ TIDAL_STEP_BATCH songs): match, create
 * the playlist if needed, append, record. Idempotent under retries and
 * concurrent calls: a lease makes a second concurrent step answer
 * `busy: true` without doing anything; a failure after TIDAL accepted the
 * tracks but before we recorded them is harmless (`onDuplicates: SKIP`).
 * A 404 on add is checked with `GET /playlists/{id}`: gone (the person
 * deleted it) → new generation (`restartGeneration`, capped), the next step
 * rebuilds it with the whole party; still there → one of the TRACKS 404'd:
 * the batch is re-sent song by song and the ones TIDAL refuses are `missing`.
 */
export async function stepTidalExport(userId: string, backlogId: string): Promise<ExportState> {
  assertMusicExportLive();
  limit(`music-export-step:${userId}`, STEPS_PER_MINUTE);
  const cfg = tidalOAuthConfig();
  if (!cfg) throw notConfigured("tidal");
  const party = await partyFor(userId, backlogId);
  const existing = (await findExport(userId, backlogId, "tidal")) ?? (await upsertExport(userId, backlogId, "tidal"));

  const now = new Date();
  const [row] = await db
    .update(partyExports)
    .set({ leaseUntil: new Date(now.getTime() + LEASE_MS) })
    .where(and(eq(partyExports.id, existing.id), or(isNull(partyExports.leaseUntil), lt(partyExports.leaseUntil, now))))
    .returning();
  if (!row) return stateOf("tidal", party, existing, true);

  let current = row;
  try {
    const plan = planExport(party.songs, await loadItems(row.id));
    if (plan.pending.length === 0) return await stateOf("tidal", party, row);
    const pendingIds = new Set(plan.pending);
    const batch = party.songs.filter((s) => pendingIds.has(s.titleId)).slice(0, TIDAL_STEP_BATCH);

    const access = await getTidalAccess(userId);
    const country = access.countryCode ?? FALLBACK_COUNTRY;
    const matches = await matchOnTidal(cfg, batch, country).catch(upstream);
    const trackIds = batch.map((s) => matches.get(s.titleId)).filter((id): id is string => Boolean(id));

    if (trackIds.length > 0 && !current.remotePlaylistId) {
      const created = await withUserToken(userId, access, (token) =>
        tidalCreatePlaylist(token, {
          name: party.name,
          description: `La colección de fiesta «${party.name}», desde kura.`,
          idempotencyKey: tidalIdempotencyKey(row.id, row.generation, party.name),
        }),
      ).catch(upstream);
      const [saved] = await db
        .update(partyExports)
        .set({ remotePlaylistId: created.id, remoteUrl: created.url, updatedAt: new Date() })
        .where(and(eq(partyExports.id, row.id), eq(partyExports.generation, row.generation)))
        .returning();
      current = saved ?? { ...current, remotePlaylistId: created.id, remoteUrl: created.url };
    }

    /** Track ids TIDAL refused one by one (404) while the playlist exists. */
    const refused = new Set<string>();
    if (trackIds.length > 0 && current.remotePlaylistId) {
      const playlistId = current.remotePlaylistId;
      try {
        await withUserToken(userId, access, (token) => tidalAddTracks(token, playlistId, trackIds));
      } catch (err) {
        if (!(err instanceof TidalHttpError && err.status === 404)) upstream(err);
        const exists = await withUserToken(userId, access, (token) => tidalPlaylistExists(token, playlistId)).catch(upstream);
        if (!exists) {
          // Deleted in TIDAL: start over with a new playlist (new idempotency key).
          return await stateOf("tidal", party, await restartGeneration(row.id));
        }
        for (const id of trackIds) {
          try {
            await withUserToken(userId, access, (token) => tidalAddTracks(token, playlistId, [id]));
          } catch (one) {
            if (one instanceof TidalHttpError && one.status === 404) refused.add(id);
            else upstream(one);
          }
        }
      }
    }

    await writeItems(
      row.id,
      batch.map((s) => {
        const found = matches.get(s.titleId) ?? null;
        const id = found && !refused.has(found) ? found : null;
        return { titleId: s.titleId, outcome: id ? ("added" as const) : ("missing" as const), remoteTrackId: id };
      }),
    );
    return await stateOf("tidal", party, current);
  } finally {
    await db.update(partyExports).set({ leaseUntil: null }).where(eq(partyExports.id, row.id));
  }
}

// ---------- Apple Music (client-side, reported) ----------

export interface AppleMusicReport {
  /**
   * The library playlist the client created/extended — or null: "there is
   * no playlist" (nothing of the party exists in their storefront). With
   * `replace` that also retires the recorded one (they deleted it), so the
   * state stops pointing "Abrir en Apple Music" at a dead playlist.
   */
  playlistId: string | null;
  /** The client created a NEW playlist because the recorded one is gone. */
  replace?: boolean;
  added: string[];
  missing: string[];
}

/**
 * The client (MusicKit) created/extended the library playlist and says what
 * happened. The first report records the playlist; a report naming ANOTHER
 * playlist is `playlist_exists` (409) unless `replace` (the recorded one
 * 404'd in the person's library), which starts the item list over.
 * Only titleIds that are in the party count; `added` wins over `missing`
 * (with `playlistId: null` nothing can be `added`). 30 reports/min per user.
 */
export async function reportAppleMusicExport(
  userId: string,
  backlogId: string,
  report: AppleMusicReport,
): Promise<ExportState> {
  assertMusicExportLive();
  limit(`music-export-report:${userId}`, REPORTS_PER_MINUTE);
  const party = await partyFor(userId, backlogId);
  const row = (await findExport(userId, backlogId, "apple_music")) ?? (await upsertExport(userId, backlogId, "apple_music"));
  let current = row;
  if (row.remotePlaylistId !== report.playlistId) {
    if (row.remotePlaylistId && !report.replace) throw playlistExists("apple_music");
    const [saved] = await db
      .update(partyExports)
      .set({
        remotePlaylistId: report.playlistId,
        remoteUrl: report.playlistId ? applePlaylistUrl(report.playlistId) : null,
        generation: row.remotePlaylistId ? sql`${partyExports.generation} + 1` : sql`${partyExports.generation}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(partyExports.id, row.id),
          row.remotePlaylistId === null ? isNull(partyExports.remotePlaylistId) : eq(partyExports.remotePlaylistId, row.remotePlaylistId),
        ),
      )
      .returning();
    if (!saved) throw playlistExists("apple_music"); // lost a race with another device
    if (row.remotePlaylistId) await db.delete(partyExportItems).where(eq(partyExportItems.exportId, row.id));
    current = saved;
  }
  await writeItems(
    row.id,
    reportItems(
      party.songs.map((s) => s.titleId),
      report.playlistId ? report.added : [],
      report.missing,
    ),
  );
  return stateOf("apple_music", party, current);
}

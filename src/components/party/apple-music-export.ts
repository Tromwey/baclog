"use client";

import type { ExportSong, ExportState } from "@/modules/music-export/types";
import type { MusicKitInstance } from "./musickit";

/**
 * Apple Music export on the web — the CLIENT half of contract §6.1 (MusicKit
 * JS does the work in the user's own library; the server only records what
 * happened). The steps, exactly as the contract orders them:
 *
 *  1. the caller already has `ExportState` (`startPartyExportAction`) and an
 *     AUTHORIZED MusicKit instance;
 *  2. playlist check FIRST: an existing `state.playlist.id` that answers 404
 *     was deleted by the person → a new playlist with the WHOLE party,
 *     reported with `replace: true` (D9);
 *  3. availability in THEIR storefront: `catalog/{sf}/songs?ids=` (≤ 300),
 *     then `filter[isrc]` for the ids that didn't come back; still nothing →
 *     missing;
 *  4. before adding to an existing playlist, read its tracks and skip what is
 *     already there (`playParams.catalogId`) — what keeps a retry after a
 *     half-reported attempt from duplicating;
 *  5. create (reporting the new id AT ONCE) / add in small batches, reporting
 *     after each one so the bar is real and a death mid-way loses nothing.
 *
 * MusicKit failures throw (the screen turns them into "no se pudo
 * exportar."); a refused action throws `ActionRefused` with the action's
 * result so the screen can map it (playlist_exists, not_found, session…).
 */

const IDS_PER_LOOKUP = 300;
const ISRC_PER_LOOKUP = 25;
/** Songs per add + report: small enough for the bar to move per song group. */
const ADD_BATCH = 5;

export class ActionRefused extends Error {
  constructor(readonly result: unknown) {
    super("action refused");
    this.name = "ActionRefused";
  }
}

export interface AppleProgress {
  processed: number;
  total: number;
  current: string | null;
}

export interface AppleExportDeps {
  mk: MusicKitInstance;
  state: ExportState;
  /** `reportAppleMusicExportAction` → the new state, or throws `ActionRefused`. */
  report: (input: { playlistId: string; replace?: boolean; added: string[]; missing: string[] }) => Promise<ExportState>;
  onProgress: (p: AppleProgress) => void;
  /** False once the screen closed or a retry started: stop quietly. */
  alive: () => boolean;
}

type Resource = { id?: unknown; attributes?: { isrc?: unknown; playParams?: { catalogId?: unknown } } };

function resources(res: { data?: unknown } | undefined): Resource[] {
  const body = res?.data as { data?: unknown } | undefined;
  return Array.isArray(body?.data) ? (body.data as Resource[]) : [];
}

function nextOf(res: { data?: unknown } | undefined): string | null {
  const body = res?.data as { next?: unknown } | undefined;
  return typeof body?.next === "string" ? body.next : null;
}

/** MusicKit's thrown errors carry the HTTP status in a few shapes. */
export function isNotFound(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { status?: unknown; errorCode?: unknown; response?: { status?: unknown }; message?: unknown };
  return (
    e.status === 404 ||
    e.response?.status === 404 ||
    e.errorCode === "NOT_FOUND" ||
    (typeof e.message === "string" && /\b404\b|not ?found/i.test(e.message))
  );
}

function chunks<T>(list: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

const post = (body: unknown): { fetchOptions: RequestInit } => ({
  fetchOptions: { method: "POST", body: JSON.stringify(body) },
});

async function playlistExists(mk: MusicKitInstance, id: string): Promise<boolean> {
  try {
    await mk.api.music(`/v1/me/library/playlists/${encodeURIComponent(id)}`);
    return true;
  } catch (err) {
    if (isNotFound(err)) return false;
    throw err;
  }
}

/** Catalog ids already in the playlist (an EMPTY library playlist answers 404 on /tracks). */
async function playlistCatalogIds(mk: MusicKitInstance, id: string): Promise<Set<string>> {
  const out = new Set<string>();
  let offset = 0;
  for (let page = 0; page < 50; page++) {
    let res;
    try {
      res = await mk.api.music(`/v1/me/library/playlists/${encodeURIComponent(id)}/tracks`, { limit: 100, offset });
    } catch (err) {
      if (isNotFound(err)) return out;
      throw err;
    }
    const rows = resources(res);
    for (const r of rows) {
      const c = r.attributes?.playParams?.catalogId;
      if (typeof c === "string" || typeof c === "number") out.add(String(c));
    }
    if (!nextOf(res) || rows.length === 0) break;
    offset += rows.length;
  }
  return out;
}

/** titleId → catalog id in the user's storefront, for the songs Apple has there. */
async function resolveInStorefront(mk: MusicKitInstance, sf: string, songs: readonly ExportSong[]) {
  const resolved = new Map<string, string>();
  const withId = songs.filter((s) => s.appleMusicId);
  for (const group of chunks(withId, IDS_PER_LOOKUP)) {
    let found: Resource[] = [];
    try {
      found = resources(
        await mk.api.music(`/v1/catalog/${sf}/songs`, { ids: group.map((s) => s.appleMusicId).join(",") }),
      );
    } catch (err) {
      if (!isNotFound(err)) throw err; // none of them in this storefront
    }
    const ids = new Set(found.map((r) => String(r.id)));
    for (const s of group) if (ids.has(String(s.appleMusicId))) resolved.set(s.titleId, String(s.appleMusicId));
  }
  const byIsrc = songs.filter((s) => !resolved.has(s.titleId) && s.isrc);
  for (const group of chunks(byIsrc, ISRC_PER_LOOKUP)) {
    let found: Resource[] = [];
    try {
      found = resources(
        await mk.api.music(`/v1/catalog/${sf}/songs`, { "filter[isrc]": group.map((s) => s.isrc).join(",") }),
      );
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }
    const byCode = new Map<string, string>();
    for (const r of found) {
      const code = typeof r.attributes?.isrc === "string" ? r.attributes.isrc.toUpperCase() : null;
      if (code && r.id && !byCode.has(code)) byCode.set(code, String(r.id));
    }
    for (const s of group) {
      const id = byCode.get(String(s.isrc).toUpperCase());
      if (id) resolved.set(s.titleId, id);
    }
  }
  return resolved;
}

/**
 * Runs the export. Returns the final state: the server's, or — when nothing
 * could be found at all and there is no playlist to report against — a local
 * "done" with every song missing (nothing to open, nothing recorded).
 * Returns null when `alive()` turned false mid-way.
 */
export async function runAppleMusicExport(deps: AppleExportDeps): Promise<ExportState | null> {
  const { mk, onProgress, alive } = deps;
  let state = deps.state;
  const total = state.total;

  let playlistId = state.playlist?.id ?? null;
  let replace = false;
  if (playlistId && !(await playlistExists(mk, playlistId))) {
    playlistId = null;
    replace = true; // D9: they deleted it — a new one with the whole party
  }
  if (!alive()) return null;

  const work = replace ? state.songs : state.songs.filter((s) => s.state === "pending");
  if (work.length === 0) return state;
  const base = replace ? 0 : state.processed;
  onProgress({ processed: base, total, current: work[0].title });

  const sf = mk.storefrontId || "mx";
  const resolved = await resolveInStorefront(mk, sf, work);
  if (!alive()) return null;
  const missing = work.filter((s) => !resolved.has(s.titleId)).map((s) => s.titleId);
  const found = work.filter((s) => resolved.has(s.titleId));

  const already = playlistId ? await playlistCatalogIds(mk, playlistId) : new Set<string>();
  if (!alive()) return null;
  const inPlaylist = found.filter((s) => already.has(resolved.get(s.titleId)!)).map((s) => s.titleId);
  const toSend = found.filter((s) => !already.has(resolved.get(s.titleId)!));

  if (!playlistId && toSend.length === 0) {
    // Nothing of the party exists in their storefront: no playlist to make.
    const lost = new Set(work.map((s) => s.titleId));
    const songs = state.songs.map((s) => (lost.has(s.titleId) ? { ...s, state: "missing" as const } : s));
    return {
      ...state,
      status: "done",
      processed: total,
      current: null,
      songs,
      missing: songs.filter((s) => s.state === "missing"),
    };
  }

  let missingReported = false;
  const report = async (added: string[]) => {
    state = await deps.report({
      playlistId: playlistId!,
      ...(replace ? { replace: true } : {}),
      added,
      missing: missingReported ? [] : missing,
    });
    missingReported = true;
    replace = false;
    onProgress({ processed: state.processed, total, current: null });
  };

  const track = (s: ExportSong) => ({ id: resolved.get(s.titleId)!, type: "songs" });
  let queue = toSend;
  if (!playlistId) {
    const first = queue.slice(0, ADD_BATCH);
    onProgress({ processed: base, total, current: first[0].title });
    const created = await mk.api.music(
      "/v1/me/library/playlists",
      {},
      post({
        attributes: {
          name: state.playlistName,
          description: `La colección de fiesta «${state.playlistName}», desde kura.`,
        },
        relationships: { tracks: { data: first.map(track) } },
      }),
    );
    const id = resources(created)[0]?.id;
    if (typeof id !== "string" || !id) throw new Error("MusicKit: created playlist without an id");
    playlistId = id;
    // Report the new id AT ONCE (§6.1.5), so a death right here doesn't make a second playlist.
    await report(first.map((s) => s.titleId));
    queue = queue.slice(ADD_BATCH);
  } else if (inPlaylist.length > 0 || missing.length > 0) {
    await report(inPlaylist);
  }

  for (const group of chunks(queue, ADD_BATCH)) {
    if (!alive()) return null;
    onProgress({ processed: state.processed, total, current: group[0].title });
    await mk.api.music(
      `/v1/me/library/playlists/${encodeURIComponent(playlistId)}/tracks`,
      {},
      post({ data: group.map(track) }),
    );
    await report(group.map((s) => s.titleId));
  }
  if (!missingReported) await report([]);
  return state;
}

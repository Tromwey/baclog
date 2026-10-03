import type { ExportSongState, MusicProvider } from "./types";

/**
 * Music export — PURE and client-safe rules (no node:crypto, no DB): copy,
 * the return whitelist of the web OAuth flow, playlist URLs and the export
 * plan arithmetic. Exercised by `scripts/check-music-export.ts`.
 */

export function serviceLabel(p: MusicProvider): string {
  return p === "tidal" ? "TIDAL" : "Apple Music";
}

export function parseProvider(raw: unknown): MusicProvider | null {
  return raw === "tidal" || raw === "apple_music" ? raw : null;
}

/** The design's failure body ("no se pudo exportar."). */
export const SERVICE_FAILED_MESSAGE = (p: MusicProvider) =>
  `${serviceLabel(p)} dejó de responder a mitad del proceso. Tu colección sigue intacta en kura; al reintentar no se duplican canciones.`;

/** "N de M canciones ya están en tu playlist de {svc}." */
export function doneLine(p: MusicProvider, exported: number, total: number): string {
  return `${exported} de ${total} canciones ya están en tu playlist de ${serviceLabel(p)}.`;
}

/** Same copy as `/api/v1/parties/{id}` (a party you can't see = not found). */
export const PARTY_NOT_FOUND_MESSAGE =
  "No encontramos esa fiesta. Puede que ya no exista o que no seas parte de ella.";

// ---------- web OAuth return whitelist ----------

const PARTY_PATH_RE = /^\/c\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SETTINGS_PATHS = new Set(["/settings", "/settings/musica"]);

/**
 * Where the web TIDAL callback may land: the party page `/c/{uuid}` or the
 * settings pages. A closed list (an open redirect after an OAuth dance is a
 * phishing primitive). Anything else → null → `/settings/musica`.
 */
export function safeMusicReturn(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  if (PARTY_PATH_RE.test(raw) || SETTINGS_PATHS.has(raw)) return raw;
  return null;
}

export const MUSIC_RETURN_FALLBACK = "/settings/musica";

/** The landing after the web callback: `{path}?music=tidal&connected=1|0[&reason=…]`. */
export function musicLanding(path: string, ok: boolean, reason?: string): string {
  const q = new URLSearchParams({ music: "tidal", connected: ok ? "1" : "0" });
  if (!ok && reason) q.set("reason", reason);
  return `${path}?${q.toString()}`;
}

/** The web entry point (a plain navigation, the browser carries the cookie). */
export function tidalStartPath(returnTo: string): string {
  const safe = safeMusicReturn(returnTo) ?? MUSIC_RETURN_FALLBACK;
  return `/api/music/tidal/start?return=${encodeURIComponent(safe)}`;
}

/** iOS: where the callback bounces (ASWebAuthenticationSession, scheme `kura`). */
export const IOS_CALLBACK_SCHEME = "kura";
/** `ref` = the state; `claim` = the callback's one-time proof (see pkce.ts `newClaim`). */
export function iosAuthorizedUrl(ref: string, claim: string): string {
  return `kura://music/tidal/authorized?ref=${encodeURIComponent(ref)}&claim=${encodeURIComponent(claim)}`;
}
export function iosFailedUrl(reason: string): string {
  return `kura://music/tidal/connected?ok=0&reason=${encodeURIComponent(reason)}`;
}

// ---------- remote playlist URLs (server-derived, never client-provided) ----------

const APPLE_LIBRARY_PLAYLIST_RE = /^p\.[A-Za-z0-9]{1,64}$/;
/** A client-reported Apple Music playlist id (library ids look like `p.AbC123`). */
export const APPLE_PLAYLIST_ID_RE = /^[A-Za-z0-9._-]{1,128}$/;

export function applePlaylistUrl(id: string): string | null {
  return APPLE_LIBRARY_PLAYLIST_RE.test(id) ? `https://music.apple.com/library/playlist/${id}` : null;
}

const TIDAL_ID_RE = /^[A-Za-z0-9-]{1,64}$/;
export function tidalPlaylistUrl(id: string, sharingHref?: string | null): string | null {
  if (sharingHref) {
    try {
      const u = new URL(sharingHref);
      if (u.protocol === "https:" && (u.hostname === "tidal.com" || u.hostname.endsWith(".tidal.com"))) {
        return u.toString();
      }
    } catch {
      // fall through to the canonical form
    }
  }
  return TIDAL_ID_RE.test(id) ? `https://tidal.com/playlist/${id}` : null;
}

// ---------- the export plan ----------

export interface PlanSong {
  titleId: string;
}
export interface PlanItem {
  titleId: string;
  outcome: "added" | "missing";
}

/**
 * What an export has to do with the party's CURRENT songs (in playlist
 * order): each song is `added` / `missing` if an item says so, else
 * `pending`. Items for songs no longer in the party are ignored (they stay in
 * the remote playlist; we never delete there). This is the whole "no
 * duplicates on retry" rule: a song with an `added` item is never sent again.
 */
export function planExport(songs: readonly PlanSong[], items: readonly PlanItem[]) {
  const byId = new Map(items.map((i) => [i.titleId, i.outcome]));
  const states: { titleId: string; state: ExportSongState }[] = songs.map((s) => ({
    titleId: s.titleId,
    state: byId.get(s.titleId) ?? "pending",
  }));
  const exported = states.filter((s) => s.state === "added").length;
  const missing = states.filter((s) => s.state === "missing").length;
  const pending = states.filter((s) => s.state === "pending").map((s) => s.titleId);
  return { states, exported, missing, pending, total: songs.length, processed: exported + missing };
}

/**
 * A client report (Apple Music) → the items to write: only titleIds that are
 * in the party, deduped, `added` winning over `missing` (a song the client
 * managed to add is in the playlist, whatever else it said).
 */
export function reportItems(
  partyTitleIds: readonly string[],
  added: readonly string[],
  missing: readonly string[],
): PlanItem[] {
  const inParty = new Set(partyTitleIds);
  const out = new Map<string, "added" | "missing">();
  for (const id of missing) if (inParty.has(id)) out.set(id, "missing");
  for (const id of added) if (inParty.has(id)) out.set(id, "added");
  return [...out].map(([titleId, outcome]) => ({ titleId, outcome }));
}

// ---------- TIDAL 403: auth/scope vs. everything else ----------

const TIDAL_AUTH_CODE_RE = /SCOPE|AUTH|TOKEN|CREDENTIAL|PERMISSION|INSUFFICIENT/i;

/**
 * Is a TIDAL 403 about OUR access (→ drop the link, "Conectar TIDAL" again)?
 * Yes when a JSON:API `errors[].code` names scope/auth, or when the link's
 * granted scopes (known) lack `playlists.write`. Anything else (terms not
 * accepted, quota, entitlement, an unexplained 403) is NOT a reason to throw
 * the person's link away → `service_failed` with `tidalForbiddenMessage`.
 */
export function isTidalAuthRefusal(codes: readonly string[], grantedScope: string | null): boolean {
  if (codes.some((c) => TIDAL_AUTH_CODE_RE.test(c))) return true;
  return grantedScope !== null && !grantedScope.split(/\s+/).includes("playlists.write");
}

export function tidalForbiddenMessage(codes: readonly string[]): string {
  if (codes.includes("REQUIRED_TERMS_NOT_ACCEPTED")) {
    return "TIDAL pide que aceptes sus términos nuevos. Ábrelo, acéptalos y vuelve a intentarlo; tu colección sigue intacta en kura.";
  }
  if (codes.includes("QUOTA_EXCEEDED")) {
    return "Tu cuenta de TIDAL llegó a su límite. Libera espacio en TIDAL y vuelve a intentarlo; tu colección sigue intacta en kura.";
  }
  return "TIDAL no dejó escribir en tu cuenta. Vuelve a intentarlo; si sigue pasando, desconecta TIDAL y conéctalo otra vez.";
}

/** Songs per TIDAL step (one ISRC call + at most this many fallback searches). */
export const TIDAL_STEP_BATCH = 10;
/** TIDAL caps `POST /playlists/{id}/relationships/items` at 50 per call. */
export const TIDAL_ADD_CHUNK = 50;

// ---------- anomalous song rows ----------

/** The fields of a party song the export's wire is strict about. */
export interface ExportableSong {
  titleId: string;
  title: string;
  artworkUrl: string | null;
  durationMs: number | null;
  appleMusicId: string | null;
}

function httpUrlOrNull(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:" ? raw : null;
  } catch {
    return null;
  }
}

/**
 * One anomalous catalog row must not turn the whole export into a 500 (the
 * wire's `ExportSongSchema` is strict and `parseOutput` fails the response).
 * So the export reads its songs through here:
 *   - a song with a blank title is DROPPED (nothing to show, nothing to
 *     search on the service) — and since the plan is computed over what is
 *     left, totals and "N de M" stay consistent;
 *   - `durationMs` that isn't a non-negative integer is rounded, or null;
 *   - `artworkUrl` that isn't an http(s) URL and `appleMusicId` that isn't
 *     all digits become null (the client already handles both as absent).
 * `dropped` / `repaired` carry the title ids for the caller's log line.
 */
export function sanitizeExportSongs<T extends ExportableSong>(
  songs: readonly T[],
): { songs: T[]; dropped: string[]; repaired: string[] } {
  const out: T[] = [];
  const dropped: string[] = [];
  const repaired: string[] = [];
  for (const s of songs) {
    const title = typeof s.title === "string" ? s.title.trim() : "";
    if (!s.titleId || !title) {
      dropped.push(String(s.titleId));
      continue;
    }
    const d = s.durationMs;
    const durationMs = typeof d === "number" && Number.isFinite(d) && d >= 0 ? Math.round(d) : null;
    const artworkUrl = httpUrlOrNull(s.artworkUrl);
    const appleMusicId = typeof s.appleMusicId === "string" && /^\d+$/.test(s.appleMusicId) ? s.appleMusicId : null;
    if (title === s.title && durationMs === s.durationMs && artworkUrl === s.artworkUrl && appleMusicId === s.appleMusicId) {
      out.push(s);
    } else {
      repaired.push(s.titleId);
      out.push({ ...s, title, durationMs, artworkUrl, appleMusicId });
    }
  }
  return { songs: out, dropped, repaired };
}

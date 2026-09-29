import { normalizeAlbumTitle, splitArtists } from "@/modules/links/resolvers/match";

/**
 * Confident TRACK matching for the TIDAL export fallback (a song whose ISRC
 * we don't know, or whose ISRC TIDAL doesn't carry). Same posture as the
 * album matcher it reuses (links/resolvers/match.ts): fail-closed — a song
 * we can't place confidently goes to "No están en TIDAL" (the person sees
 * it and can add it by hand), while a WRONG song silently in the playlist
 * is worse.
 *
 * Gate (all required):
 *   1. normalized titles equal — edition/remaster/feat qualifiers stripped
 *      on both sides, never containment («Cars» ≠ «Cars 2»);
 *   2. every credited artist of our song is credited on the candidate
 *      (splitArtists on both sides, token sets);
 *   3. when both durations are known, they differ by ≤ 7 s (a live take,
 *      an extended mix or a radio edit of the same title is another song).
 * Rank: duration gap, then equal artist sets, then upstream order.
 *
 * Pure: no `server-only`, exercised by `scripts/check-music-export.ts`.
 */

export interface TrackQuery {
  title: string;
  artist: string | null;
  durationMs: number | null;
}

export interface TrackCandidate {
  id: string;
  title: string;
  /** TIDAL `attributes.version` ("Remastered 2011", "Live") — appended when present. */
  version?: string | null;
  artists: string[];
  durationMs: number | null;
  isrc?: string | null;
}

export const MAX_DURATION_GAP_MS = 7000;

export function pickTrackMatch(query: TrackQuery, candidates: readonly TrackCandidate[]): TrackCandidate | null {
  const wantTitle = normalizeAlbumTitle(query.title);
  if (!wantTitle || !query.artist) return null;
  const wantArtists = [...new Set(splitArtists(query.artist))];
  if (wantArtists.length === 0) return null;

  const scored: { c: TrackCandidate; gap: number; exactArtists: number; i: number }[] = [];
  candidates.forEach((c, i) => {
    if (!titleMatches(wantTitle, c)) return;
    const have = new Set(c.artists.flatMap(splitArtists));
    if (have.size === 0) return;
    if (!wantArtists.every((a) => have.has(a))) return;
    let gap = 0;
    if (query.durationMs != null && c.durationMs != null) {
      gap = Math.abs(query.durationMs - c.durationMs);
      if (gap > MAX_DURATION_GAP_MS) return;
    }
    scored.push({ c, gap, exactArtists: have.size === wantArtists.length ? 0 : 1, i });
  });
  if (scored.length === 0) return null;
  scored.sort((a, b) => a.gap - b.gap || a.exactArtists - b.exactArtists || a.i - b.i);
  return scored[0].c;
}

/**
 * TIDAL splits "Song (Live)" into title "Song" + version "Live". The
 * candidate's full name is `title (version)`; a version that is NOT a known
 * edition qualifier ("Live", "Acoustic", "Radio Edit") survives normalization
 * and makes the titles differ — on purpose. Some rows repeat the version in
 * the title too («Song (Live)» + "Live"): then the bare title is the name.
 */
function titleMatches(want: string, c: TrackCandidate): boolean {
  const bare = normalizeAlbumTitle(c.title);
  if (!c.version) return bare === want;
  if (normalizeAlbumTitle(`${c.title} (${c.version})`) === want) return true;
  const v = normalizeAlbumTitle(c.version);
  return bare === want && (isEditionOnly(c.version) || (v !== "" && bare.endsWith(v)));
}

/** "Remastered 2011", "2009 Remaster", "Deluxe Edition" — versions that
 *  don't make it a different recording for a party playlist. */
function isEditionOnly(version: string): boolean {
  return normalizeAlbumTitle(`x (${version})`) === "x";
}

/** ISO 8601 duration ("PT3M58S", "PT1H2M3.5S") → ms; null when unparseable. */
export function isoDurationMs(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(raw);
  if (!m || (!m[1] && !m[2] && !m[3])) return null;
  const ms = ((Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)) * 60 + Number(m[3] ?? 0)) * 1000;
  return Number.isFinite(ms) ? Math.round(ms) : null;
}

/** ISRC shape (ISO 3901): 2 letters, 3 alnum, 7 digits. Uppercased. */
export function normalizeIsrc(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.replace(/-/g, "").trim().toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(s) ? s : null;
}

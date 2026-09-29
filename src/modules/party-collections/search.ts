import "server-only";
import { checkRateLimit } from "@/authz/api";
import { cacheSongs, searchSongs, SongSearchUnavailableError } from "@/modules/catalog/itunes-songs";
import { songFactsOf } from "@/modules/catalog/song-map";
import { getPartyAccess } from "./access";
import { findPartySongs } from "./queries";
import { songQuerySchema } from "./rules";
import type { PartySongHit } from "./types";

/**
 * Song search inside a party ("Buscar canción"): iTunes `entity=song` →
 * upsert as `track` rows (so every hit has a `titleId` to add) → each hit
 * annotated against THIS party ("Ya está · la puso @ana" / "Ya la pusiste").
 *
 * Members only (host or guest; a blocked guest may still search — the UI
 * hides it, adding is what's refused). Rate limited per user (30/min) on top
 * of the API's own limit, because each call is an upstream request + an
 * upsert. Result kinds are explicit so the UI can draw the design's states:
 * `ok` (possibly empty = "sin resultados"), `unavailable` (iTunes down = the
 * error state with "Reintentar"), `rate_limited`, `not_found`.
 */

const SEARCH_PER_MINUTE = 30;

export type PartySongSearchResult =
  | { ok: true; items: PartySongHit[] }
  | { ok: false; error: "not_found" }
  | { ok: false; error: "invalid" }
  | { ok: false; error: "unavailable" }
  | { ok: false; error: "rate_limited"; retryAfterSeconds: number };

export async function searchPartySongs(
  userId: string,
  backlogId: string,
  rawQuery: string,
): Promise<PartySongSearchResult> {
  const q = songQuerySchema.safeParse(rawQuery);
  if (!q.success) return { ok: false, error: "invalid" };
  const access = await getPartyAccess(userId, backlogId);
  if (!access) return { ok: false, error: "not_found" };

  const rl = checkRateLimit(`party-songs:${userId}`, SEARCH_PER_MINUTE);
  if (!rl.ok) return { ok: false, error: "rate_limited", retryAfterSeconds: rl.retryAfterSeconds };

  let cached;
  try {
    cached = await cacheSongs(await searchSongs(q.data));
  } catch (err) {
    if (err instanceof SongSearchUnavailableError) return { ok: false, error: "unavailable" };
    throw err;
  }
  const inParty = await findPartySongs(
    backlogId,
    cached.map((c) => c.id),
    userId,
  );
  return {
    ok: true,
    items: cached.map((c) => {
      const facts = songFactsOf(c.raw);
      const hit = inParty.get(c.id);
      return {
        titleId: c.id,
        title: c.title,
        artist: c.byline,
        album: facts.album,
        artworkUrl: c.posterUrl,
        previewUrl: facts.previewUrl,
        durationMs: facts.durationMs,
        appleMusicUrl: facts.appleMusicUrl,
        paletteHex: c.paletteHex ?? null,
        inParty: hit ? { mine: hit.adderId === userId, addedBy: hit.addedBy } : null,
      };
    }),
  };
}

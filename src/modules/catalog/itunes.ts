import "server-only";
import type { ExternalItem } from "./types";

/**
 * Collection fields shared by an album result AND the parent-album metadata
 * that every song ("track") result carries. Both indexes are queried, so one
 * mapper serves both.
 */
interface ItunesCollection {
  collectionId?: number;
  collectionName?: string;
  artistName: string;
  releaseDate?: string;
  primaryGenreName?: string;
  artworkUrl100?: string;
  /** Apple Music deep link. On a song result it points at the track
   *  (`?i=trackId`); link resolution (resolve.ts, Apple Music exact link) wants the album. */
  collectionViewUrl?: string;
}

/**
 * iTunes Search API — keyless (ADR-007). Artwork HD trick: the 100x100
 * CDN URL serves any size by rewriting the dimension segment.
 *
 * We hit the album AND song indexes in parallel and fold songs up to their
 * parent album (deduped on collectionId). iTunes' album-entity index misses
 * many new/stylized titles — e.g. "sorry si soy GRRRIS" (ROBI) returns nothing
 * under entity=album for any query — yet its song index still matches them,
 * because song search also matches on the parent collectionName. Song→album
 * folding is what makes those specific albums findable at all.
 */
export async function searchAlbums(query: string): Promise<ExternalItem[]> {
  const [albums, songs] = await Promise.all([
    fetchAlbums(query, "album"),
    fetchAlbums(query, "song"),
  ]);

  // Album-entity results first (cleanest album-level relevance), then albums
  // surfaced only through their tracks — deduped on collectionId so a title
  // present in both indexes isn't listed twice.
  const byId = new Map<string, ExternalItem>();
  for (const item of [...albums, ...songs]) {
    if (!byId.has(item.externalId)) byId.set(item.externalId, item);
  }
  return [...byId.values()];
}

/** One index (album or song), mapped to albums and pre-deduped per collection.
 *  Independently resilient: a failure here can't blank the other index. */
async function fetchAlbums(
  query: string,
  entity: "album" | "song",
): Promise<ExternalItem[]> {
  const url = new URL("https://itunes.apple.com/search");
  url.searchParams.set("term", query);
  url.searchParams.set("entity", entity);
  // Song search fans out into many tracks per album; ask for more so enough
  // distinct collections survive the fold to one-per-album.
  url.searchParams.set("limit", entity === "song" ? "25" : "10");
  url.searchParams.set("media", "music");

  try {
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) throw new Error(`iTunes ${entity} search: ${res.status}`);
    const data = await res.json();

    const out: ExternalItem[] = [];
    const seen = new Set<string>();
    for (const c of data.results as ItunesCollection[]) {
      // A track with no parent album (or an album row missing its id/name)
      // can't become a catalog album — skip it.
      if (c.collectionId == null || !c.collectionName) continue;
      const externalId = String(c.collectionId);
      if (seen.has(externalId)) continue; // collapse a collection's many tracks
      seen.add(externalId);
      out.push(toAlbumItem(c, externalId));
    }
    return out;
  } catch (err) {
    console.error(`[catalog] iTunes ${entity} search failed:`, err);
    return [];
  }
}

function toAlbumItem(c: ItunesCollection, externalId: string): ExternalItem {
  const albumUrl = toAlbumViewUrl(c.collectionViewUrl);
  // A pre-order reaches search ONLY through the song→album fold above, and its
  // song rows carry no releaseDate at all — so both of these land null and the
  // item enters the catalog dateless. getAlbumDetail fills them in later; the
  // null year is the signal that it's worth the lookup.
  const released = c.releaseDate ? new Date(c.releaseDate) : null;
  return {
    source: "itunes",
    externalId,
    mediaType: "album",
    title: c.collectionName as string,
    byline: c.artistName,
    year: c.releaseDate ? Number(c.releaseDate.slice(0, 4)) || null : null,
    releaseDate:
      released && !Number.isNaN(released.getTime()) ? released : null,
    genre: c.primaryGenreName?.toLowerCase() ?? null,
    synopsis: null,
    posterUrl: c.artworkUrl100?.replace("100x100bb", "600x600bb") ?? null,
    sourceRating: null,
    isrc: null,
    // UPC requires a lookup call; deferred to link resolution (G4) where
    // it actually matters as the canonical key
    upc: null,
    // Store the ALBUM view URL so resolve.ts resolves the album, not a track.
    raw: albumUrl ? { ...c, collectionViewUrl: albumUrl } : c,
  };
}

/** Drop the `?i=trackId` that makes a song's collectionViewUrl a track deep
 *  link; the collectionId already in the path keeps it pointed at the album.
 *  Album-entity URLs have no `i` param, so this is a no-op for them. */
function toAlbumViewUrl(viewUrl: string | undefined): string | undefined {
  if (!viewUrl) return viewUrl;
  try {
    const u = new URL(viewUrl);
    u.searchParams.delete("i");
    return u.toString();
  } catch {
    return viewUrl;
  }
}

/**
 * F3.8 / Novedades 6b — an artist's UNRELEASED albums, soonest first.
 *
 * This is the only route that reaches a pre-order reliably. Searching the
 * artist's NAME never gets there: iTunes ranks by relevance, so 20+ released
 * records come back ahead of an unreleased one whose tracks are still called
 * "Track 4" — verified against benny blanco and Mastodon, both of which have a
 * pre-order and neither of which surfaces it by name search. The artist LOOKUP
 * has no ranking to fight: it returns the whole discography, and a pre-order
 * sits there with its real future releaseDate already in the payload (no
 * per-candidate lookup needed, unlike the search path).
 *
 * `artistId` comes from the stored iTunes payload of an album the user owns
 * (catalog_item.raw), so this only ever runs for artists they already have.
 */
export async function getArtistUpcoming(
  artistId: number,
  now: number = Date.now(),
): Promise<ExternalItem[]> {
  const url = new URL("https://itunes.apple.com/lookup");
  url.searchParams.set("id", String(artistId));
  url.searchParams.set("entity", "album");
  url.searchParams.set("limit", "200");

  try {
    // 6h: short enough that a newly announced record shows up the same day,
    // long enough that a fleet of users doesn't re-ask for one discography.
    const res = await fetch(url, { next: { revalidate: 60 * 60 * 6 } });
    if (!res.ok) return [];
    const data = await res.json();
    const rows = (data.results ?? []) as Array<
      ItunesCollection & { wrapperType?: string }
    >;
    return rows
      .filter(
        (r) =>
          r.wrapperType === "collection" &&
          r.collectionId != null &&
          Boolean(r.collectionName) &&
          Boolean(r.releaseDate) &&
          new Date(r.releaseDate as string).getTime() > now,
      )
      .sort(
        (a, b) =>
          new Date(a.releaseDate as string).getTime() -
          new Date(b.releaseDate as string).getTime(),
      )
      .map((r) => toAlbumItem(r, String(r.collectionId)));
  } catch (err) {
    console.error(`[catalog] iTunes artist lookup ${artistId} failed:`, err);
    return [];
  }
}

export interface AlbumTrack {
  /** Play-order position (disc-flattened). */
  n: number;
  name: string;
  durationMs: number | null;
}

/**
 * How much staleness the caller can live with.
 * - `fresh`   — no cache at all. For the release-day cron: it exists to see the
 *   album as it is NOW, and a payload cached before the 07:00Z release would
 *   hand it the very placeholder tracklist it runs to replace.
 * - `pending` — 24h. The date is future or unknown, so it can still slip.
 * - `settled` — 30d. Already out: its tracklist and date cannot change, and
 *   this path is reachable by ANONYMOUS visitors (the public item page takes
 *   any catalog id), so a short TTL there is outbound traffic for nothing.
 */
export type DetailFreshness = "fresh" | "pending" | "settled";

export interface AlbumDetail {
  /** From the lookup's `wrapperType: "collection"` row — the ONLY place iTunes
   *  exposes a pre-order's release date (search payloads omit it entirely). */
  releaseDate: Date | null;
  /** Cover from the same collection row, at 600px. A label swaps a pre-order's
   *  art surprisingly often, so release day is the moment to take it again. */
  posterUrl: string | null;
  /** The collection's own track count, which can exceed `tracks.length` on a
   *  pre-order (iTunes counted 8, listed 7 for "Hermoso"). Drives "3 DE 11". */
  trackCount: number;
  tracks: AlbumTrack[];
}

/** iTunes' placeholder for an unreleased track: literally "Track 4", never
 *  streamable. A real song titled "Track 5" on a released album IS streamable,
 *  so requiring both keeps a genuine oddity from being swallowed. */
function isPlaceholderTrack(name: string, streamable: boolean): boolean {
  return !streamable && /^track \d+$/i.test(name.trim());
}

/**
 * An album's tracklist AND release date via the keyless iTunes lookup
 * (ADR-007). Track names are the album equivalent of a film's synopsis:
 * metadata/FACTS, the "receipt" safe zone (ADR-008) — fetched server-side like
 * the rest of the catalog. This is text, not artwork, so the "never proxy
 * images" rule (images only) does not apply. Returns an empty detail on any
 * failure — the caller just omits the section and the countdown.
 *
 * ONE call serves both: the response's first row is the collection (carrying
 * releaseDate + trackCount), the rest are its tracks. That's why F3.8 costs no
 * extra requests on the item page — this lookup was already happening and the
 * collection row was being filtered away.
 *
 * `collectionId` is the album's iTunes id, stored as catalog_item.externalId.
 * See DetailFreshness for what each caching posture is for.
 */
export async function getAlbumDetail(
  collectionId: string,
  freshness: DetailFreshness = "pending",
): Promise<AlbumDetail> {
  const EMPTY: AlbumDetail = {
    releaseDate: null,
    posterUrl: null,
    trackCount: 0,
    tracks: [],
  };
  const url = new URL("https://itunes.apple.com/lookup");
  url.searchParams.set("id", collectionId);
  url.searchParams.set("entity", "song");
  url.searchParams.set("limit", "300");

  try {
    const res = await fetch(
      url,
      freshness === "fresh"
        ? { cache: "no-store" }
        : {
            next: {
              revalidate:
                freshness === "pending" ? 60 * 60 * 24 : 60 * 60 * 24 * 30,
            },
          },
    );
    if (!res.ok) return EMPTY;
    const data = await res.json();
    const rows = (data.results ?? []) as Array<{
      wrapperType?: string;
      collectionType?: string;
      releaseDate?: string;
      artworkUrl100?: string;
      trackCount?: number;
      trackNumber?: number;
      discNumber?: number;
      trackName?: string;
      trackTimeMillis?: number;
      isStreamable?: boolean;
    }>;

    const collection = rows.find((r) => r.wrapperType === "collection");
    const parsed = collection?.releaseDate
      ? new Date(collection.releaseDate)
      : null;

    const tracks = rows
      .filter((r) => r.wrapperType === "track" && Boolean(r.trackName))
      .sort(
        (a, b) =>
          (a.discNumber ?? 1) - (b.discNumber ?? 1) ||
          (a.trackNumber ?? 0) - (b.trackNumber ?? 0),
      )
      // "Track 4" never reaches the screen (design 1f): a muted placeholder row
      // says nothing the "N canciones más" divider doesn't say better. The
      // partial tracklist splits on trackCount, so streamability matters only
      // here, as half of that test.
      .filter((t) => !isPlaceholderTrack(t.trackName as string, t.isStreamable === true))
      .map((t) => ({
        n: t.trackNumber ?? 0,
        name: t.trackName as string,
        durationMs:
          typeof t.trackTimeMillis === "number" ? t.trackTimeMillis : null,
      }));

    return {
      releaseDate: parsed && !Number.isNaN(parsed.getTime()) ? parsed : null,
      posterUrl:
        collection?.artworkUrl100?.replace("100x100bb", "600x600bb") ?? null,
      // The collection's count is the truth about how many songs the album HAS;
      // `tracks` is only what iTunes is willing to name today.
      trackCount: collection?.trackCount ?? tracks.length,
      tracks,
    };
  } catch {
    return EMPTY;
  }
}

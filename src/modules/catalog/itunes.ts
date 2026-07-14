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
   *  (`?i=trackId`); link resolution (resolve.ts → Odesli) wants the album. */
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
  return {
    source: "itunes",
    externalId,
    mediaType: "album",
    title: c.collectionName as string,
    byline: c.artistName,
    year: c.releaseDate ? Number(c.releaseDate.slice(0, 4)) || null : null,
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

export interface AlbumTrack {
  /** Play-order position (disc-flattened). */
  n: number;
  name: string;
  durationMs: number | null;
}

/**
 * An album's tracklist via the keyless iTunes lookup (ADR-007). Track names are
 * the album equivalent of a film's synopsis: metadata/FACTS, the "receipt" safe
 * zone (ADR-008) — fetched server-side like the rest of the catalog. This is
 * text, not artwork, so the "never proxy images" rule (images only) does not
 * apply. Cached 30d: a released album's tracklist is effectively immutable.
 * Returns [] on any failure — the caller just omits the section.
 *
 * `collectionId` is the album's iTunes id, stored as catalog_item.externalId.
 */
export async function getAlbumTracks(collectionId: string): Promise<AlbumTrack[]> {
  const url = new URL("https://itunes.apple.com/lookup");
  url.searchParams.set("id", collectionId);
  url.searchParams.set("entity", "song");
  url.searchParams.set("limit", "300");

  try {
    const res = await fetch(url, {
      next: { revalidate: 60 * 60 * 24 * 30 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const rows = (data.results ?? []) as Array<{
      wrapperType?: string;
      trackNumber?: number;
      discNumber?: number;
      trackName?: string;
      trackTimeMillis?: number;
    }>;
    return rows
      .filter((r) => r.wrapperType === "track" && Boolean(r.trackName))
      .sort(
        (a, b) =>
          (a.discNumber ?? 1) - (b.discNumber ?? 1) ||
          (a.trackNumber ?? 0) - (b.trackNumber ?? 0),
      )
      .map((t) => ({
        n: t.trackNumber ?? 0,
        name: t.trackName as string,
        durationMs:
          typeof t.trackTimeMillis === "number" ? t.trackTimeMillis : null,
      }));
  } catch {
    return [];
  }
}

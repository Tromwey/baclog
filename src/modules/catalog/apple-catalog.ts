import "server-only";
import { appleCatalogGet } from "@/modules/music-export/apple-music";
import {
  albumLookupToItunes,
  albumToItunes,
  searchToCollections,
  songToItunes,
  type AppleResource,
  type ItunesCollectionRow,
  type ItunesTrackRow,
} from "./apple-music-map";

/**
 * The Apple Music catalog API as the PRIMARY music source (2026-10-02). The
 * keyless iTunes Search API's index lags behind Apple Music — new records
 * like "Czarface Meets Frankie Pulitzer" (Aug 2026) never reach it — while the
 * Apple Music API searches the same index as the app.
 *
 * Every function here answers in iTunes row shapes (`apple-music-map.ts`) so
 * `itunes.ts` / `itunes-songs.ts` keep their mappers and only swap where the
 * rows come from. Each returns NULL when Apple can't answer — no key on this
 * deploy, a rejected key, HTTP/network failure — and the caller then asks
 * iTunes exactly as before: losing the key degrades music to the old
 * behaviour, it never blanks it.
 */

/** Album storefront: the iTunes album calls never passed `country`, i.e. US. */
const ALBUM_STOREFRONT = "us";
/** Apple's per-type ceiling for search. */
const SEARCH_LIMIT = 25;
/** Album hits kept from Apple's index (iTunes' album search asked for 10). */
const ALBUM_HITS = 10;
/** Search is typed-ahead: a slow Apple costs this much before iTunes answers instead. */
const SEARCH_TIMEOUT_MS = 2500;
/** A discography past this is someone's 400-single back catalog; iTunes' lookup capped at 200 too. */
const DISCOGRAPHY_CAP = 200;

type SearchDoc = {
  results?: { albums?: { data?: AppleResource[] }; songs?: { data?: AppleResource[] } };
};
type DataDoc = { data?: AppleResource[]; next?: string };

async function attempt<T>(label: string, run: () => Promise<T | null>): Promise<T | null> {
  try {
    return await run();
  } catch (err) {
    console.error(`[catalog] apple music ${label} failed, falling back to iTunes:`, err);
    return null;
  }
}

/** Album search (albums + the albums of matching songs), iTunes collection rows. */
export function appleSearchAlbums(query: string): Promise<ItunesCollectionRow[] | null> {
  return attempt("album search", async () => {
    const doc = await appleCatalogGet<SearchDoc>(
      `/catalog/${ALBUM_STOREFRONT}/search`,
      { term: query, types: "albums,songs", limit: String(SEARCH_LIMIT) },
      { noStore: true, signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) },
    );
    if (!doc) return null;
    const albums = doc.results?.albums?.data?.slice(0, ALBUM_HITS) ?? [];
    return searchToCollections({ results: { albums: { data: albums }, songs: doc.results?.songs } });
  });
}

/** Song search for the party (`storefront` mx: the guests' store), iTunes track rows. */
export function appleSearchSongs(
  query: string,
  limit: number,
  storefront: string,
): Promise<ItunesTrackRow[] | null> {
  return attempt("song search", async () => {
    const doc = await appleCatalogGet<SearchDoc>(
      `/catalog/${storefront}/search`,
      { term: query, types: "songs", limit: String(Math.min(limit, SEARCH_LIMIT)) },
      { revalidate: 300, signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) },
    );
    if (!doc) return null;
    return (doc.results?.songs?.data ?? [])
      .map(songToItunes)
      .filter((t): t is ItunesTrackRow => t != null);
  });
}

/**
 * One album with its whole tracklist, as iTunes' `lookup?id=…&entity=song`
 * rows (collection first). `revalidate` null = no cache (the release cron).
 */
export function appleAlbumLookup(
  collectionId: string,
  revalidate: number | null,
): Promise<Array<ItunesCollectionRow | ItunesTrackRow> | null> {
  if (!/^\d{1,20}$/.test(collectionId)) return Promise.resolve(null);
  const cache = revalidate == null ? { noStore: true } : { revalidate };
  return attempt(`album ${collectionId}`, async () => {
    const doc = await appleCatalogGet<DataDoc>(`/catalog/${ALBUM_STOREFRONT}/albums/${collectionId}`, {}, cache);
    const album = doc?.data?.[0];
    if (!doc || !album) return null;
    // Albums past ~300 tracks page their relationship; follow it.
    const extra: AppleResource[] = [];
    let next = album.relationships?.tracks?.next;
    for (let page = 0; next && page < 5; page++) {
      const more = await appleCatalogGet<DataDoc>(next, {}, cache);
      extra.push(...(more?.data ?? []));
      next = more?.next;
    }
    const rows = albumLookupToItunes(album, extra);
    return rows.length > 0 ? rows : null;
  });
}

/**
 * An artist's discography (every album/single/EP, pre-orders included with
 * their future day) + the artist's name — what `lookupArtistAlbums` builds
 * from iTunes' `lookup?id=…&entity=album`.
 */
export function appleArtistAlbums(
  artistId: number,
  signal?: AbortSignal,
): Promise<{ artistName: string | null; albums: ItunesCollectionRow[] } | null> {
  const opts = { revalidate: 60 * 60 * 6, signal };
  return attempt(`artist ${artistId}`, async () => {
    const base = `/catalog/${ALBUM_STOREFRONT}/artists/${artistId}`;
    const [artist, first] = await Promise.all([
      appleCatalogGet<DataDoc>(base, {}, opts).catch(() => null),
      // 100 per page; if Apple ever lowers that ceiling (a 400), page at its default.
      appleCatalogGet<DataDoc>(`${base}/albums`, { limit: "100" }, opts).catch((err: unknown) => {
        if (err instanceof Error && / 400$/.test(err.message)) {
          return appleCatalogGet<DataDoc>(`${base}/albums`, {}, opts);
        }
        throw err;
      }),
    ]);
    if (!first) return null;
    const albums: AppleResource[] = [...(first.data ?? [])];
    let next = first.next;
    while (next && albums.length < DISCOGRAPHY_CAP) {
      const more = await appleCatalogGet<DataDoc>(next, {}, opts);
      albums.push(...(more?.data ?? []));
      next = more?.next;
    }
    return {
      artistName: artist?.data?.[0]?.attributes?.name ?? null,
      albums: albums
        .slice(0, DISCOGRAPHY_CAP)
        .map(albumToItunes)
        .filter((r): r is ItunesCollectionRow => r != null),
    };
  });
}

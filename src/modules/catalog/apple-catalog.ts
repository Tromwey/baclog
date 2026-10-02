import "server-only";
import { appleCatalogGet } from "@/modules/music-export/apple-music";
import {
  albumLookupToItunes,
  albumToItunes,
  DEFAULT_STOREFRONT,
  searchToCollections,
  songToItunes,
  storefrontForCountry,
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
 *
 * Storefronts: SEARCH runs in the viewer's store (their country, like "dónde
 * ver" for video) and stamps it on each album (`raw._storefront`); every
 * later LOOKUP of that album runs in the stamped store, whoever triggers it
 * (the cron has no viewer). Any store other than `us` that fails is retried
 * in `us` before giving up to iTunes (which is US too).
 */

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
    console.error(`[catalog] apple music ${label} failed:`, err);
    return null;
  }
}

/**
 * `run` in `storefront`, then in `us` when that store didn't have it (empty,
 * 404, or 400 for a store Apple doesn't run). An outage (timeout, 5xx, auth)
 * is NOT retried in `us`: it would only double the wait before iTunes.
 */
async function inStoreThenUs<T>(
  label: string,
  storefront: string,
  run: (sf: string) => Promise<T | null>,
): Promise<{ value: T; storefront: string } | null> {
  let missing = true;
  try {
    const first = await run(storefront);
    if (first != null) return { value: first, storefront };
  } catch (err) {
    missing = err instanceof Error && / (400|404)$/.test(err.message);
    console.error(`[catalog] apple music ${label} (${storefront}) failed:`, err);
  }
  if (!missing || storefront === DEFAULT_STOREFRONT) return null;
  const us = await attempt(`${label} (${DEFAULT_STOREFRONT})`, () => run(DEFAULT_STOREFRONT));
  return us != null ? { value: us, storefront: DEFAULT_STOREFRONT } : null;
}

let storefrontIds: { ids: Set<string>; at: number } | null = null;

/**
 * Apple Music's storefront ids (`/v1/storefronts`, ~170), so a viewer in a
 * country without Apple Music searches `us` directly instead of failing first.
 * Per instance for a day; null when unknown (no key, Apple down) — then any
 * well-formed country is tried and `inStoreThenUs` covers a miss.
 */
async function knownStorefronts(): Promise<Set<string> | null> {
  if (storefrontIds && Date.now() - storefrontIds.at < 24 * 60 * 60 * 1000) return storefrontIds.ids;
  return attempt("storefronts", async () => {
    const ids = new Set<string>();
    let doc = await appleCatalogGet<DataDoc>("/storefronts", {}, { revalidate: 60 * 60 * 24 });
    for (let page = 0; doc && page < 12; page++) {
      for (const s of doc.data ?? []) if (s.id) ids.add(s.id.toLowerCase());
      doc = doc.next ? await appleCatalogGet<DataDoc>(doc.next, {}, { revalidate: 60 * 60 * 24 }) : null;
    }
    if (ids.size === 0) return null;
    storefrontIds = { ids, at: Date.now() };
    return ids;
  });
}

/** The store to search for a viewer's country (`x-vercel-ip-country`). */
export async function searchStorefront(country: string | null | undefined): Promise<string> {
  if (storefrontForCountry(country) === DEFAULT_STOREFRONT) return DEFAULT_STOREFRONT;
  return storefrontForCountry(country, await knownStorefronts());
}

/** Album search (albums + the albums of matching songs) in `storefront`,
 *  iTunes collection rows stamped with the store that answered. An EMPTY
 *  answer in a local store also tries `us` (a US-only record). */
export async function appleSearchAlbums(
  query: string,
  storefront: string = DEFAULT_STOREFRONT,
): Promise<ItunesCollectionRow[] | null> {
  const hit = await inStoreThenUs("album search", storefront, async (sf) => {
    const doc = await appleCatalogGet<SearchDoc>(
      `/catalog/${sf}/search`,
      { term: query, types: "albums,songs", limit: String(SEARCH_LIMIT) },
      { noStore: true, signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) },
    );
    if (!doc) return null;
    const albums = doc.results?.albums?.data?.slice(0, ALBUM_HITS) ?? [];
    const rows = searchToCollections({ results: { albums: { data: albums }, songs: doc.results?.songs } }, sf);
    return rows.length > 0 ? rows : null;
  });
  return hit?.value ?? null;
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
 * rows (collection first), in the store the album was found in
 * (`storefrontOfRaw`). `revalidate` null = no cache (the release cron).
 */
export async function appleAlbumLookup(
  collectionId: string,
  revalidate: number | null,
  storefront: string = DEFAULT_STOREFRONT,
): Promise<Array<ItunesCollectionRow | ItunesTrackRow> | null> {
  if (!/^\d{1,20}$/.test(collectionId)) return null;
  const cache = revalidate == null ? { noStore: true } : { revalidate };
  const hit = await inStoreThenUs(`album ${collectionId}`, storefront, async (sf) => {
    const doc = await appleCatalogGet<DataDoc>(`/catalog/${sf}/albums/${collectionId}`, {}, cache);
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
    const rows = albumLookupToItunes(album, extra, sf);
    return rows.length > 0 ? rows : null;
  });
  return hit?.value ?? null;
}

/**
 * An artist's discography (every album/single/EP, pre-orders included with
 * their future day) + the artist's name — what `lookupArtistAlbums` builds
 * from iTunes' `lookup?id=…&entity=album`. `storefront` = the store of the
 * album the artist id came from.
 */
export async function appleArtistAlbums(
  artistId: number,
  signal?: AbortSignal,
  storefront: string = DEFAULT_STOREFRONT,
): Promise<{ artistName: string | null; albums: ItunesCollectionRow[] } | null> {
  const opts = { revalidate: 60 * 60 * 6, signal };
  const hit = await inStoreThenUs(`artist ${artistId}`, storefront, async (sf) => {
    const base = `/catalog/${sf}/artists/${artistId}`;
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
        .map((a) => albumToItunes(a, sf))
        .filter((r): r is ItunesCollectionRow => r != null),
    };
  });
  return hit?.value ?? null;
}

import "server-only";
import type { ExternalItem } from "./types";

/**
 * Onboarding pool (v2, 2026-09-03) — Apple's most-played albums chart
 * (Apple Marketing Tools RSS v2, keyless like the rest of iTunes, ADR-007).
 * Chosen over an iTunes Search by genre term: the search index matches the
 * TERM against titles ("rock" returns albums called Rock), while the chart
 * is an actual curated ranking with real covers.
 *
 * `rss.applemarketingtools.com` 301s to this host; fetch the target directly.
 * An hour of cache: the chart is the same for everyone and moves daily.
 *
 * The RSS `id` IS the iTunes collectionId, so the item lands under the same
 * (`itunes`, externalId) key a search would give it — a pool pick and a
 * searched pick of the same record are ONE catalog row. `raw` is rebuilt in
 * the iTunes Search collection shape (`collectionViewUrl`, `artistId`, …) so
 * the link resolver and the artist-upcoming lookup read it like any other
 * album row.
 */
export type Storefront = "mx" | "us";

interface RssAlbum {
  id?: string;
  name?: string;
  artistName?: string;
  artistId?: string;
  artworkUrl100?: string;
  releaseDate?: string;
  url?: string;
  genres?: { name?: string }[];
}

export async function mostPlayedAlbums(
  storefront: Storefront,
): Promise<ExternalItem[]> {
  const url = `https://rss.marketingtools.apple.com/api/v2/${storefront}/music/most-played/100/albums.json`;
  try {
    const res = await fetch(url, { next: { revalidate: 60 * 60 } });
    if (!res.ok) {
      console.error(`[catalog] Apple chart ${storefront} failed: ${res.status}`);
      return [];
    }
    const data = (await res.json()) as { feed?: { results?: RssAlbum[] } };
    const out: ExternalItem[] = [];
    for (const a of data.feed?.results ?? []) {
      if (!a.id || !a.name || !a.artistName || !a.artworkUrl100) continue;
      const released = a.releaseDate ? new Date(a.releaseDate) : null;
      const validDate = released && !Number.isNaN(released.getTime());
      const genre = a.genres?.[0]?.name;
      out.push({
        source: "itunes",
        externalId: a.id,
        mediaType: "album",
        title: a.name,
        byline: a.artistName,
        year: validDate ? released.getFullYear() : null,
        releaseDate: validDate ? released : null,
        genre: genre ? genre.toLowerCase() : null,
        synopsis: null,
        posterUrl: a.artworkUrl100.replace("100x100bb", "600x600bb"),
        sourceRating: null,
        isrc: null,
        upc: null,
        raw: {
          wrapperType: "collection",
          collectionType: "Album",
          collectionId: Number(a.id),
          collectionName: a.name,
          artistName: a.artistName,
          artistId: a.artistId ? Number(a.artistId) : undefined,
          releaseDate: a.releaseDate,
          primaryGenreName: genre,
          artworkUrl100: a.artworkUrl100,
          collectionViewUrl: a.url,
        },
      });
    }
    return out;
  } catch (err) {
    console.error(`[catalog] Apple chart ${storefront} failed:`, err);
    return [];
  }
}

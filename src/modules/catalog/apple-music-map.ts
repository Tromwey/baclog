/**
 * Apple Music catalog API → the iTunes Search/Lookup row shapes the rest of
 * the catalog already speaks. PURE (no `server-only`, no fetch) so
 * `scripts/check-apple-music-map.ts` exercises it with fixtures.
 *
 * Why translate instead of a new shape: album/song ids are the SAME numbers
 * in both APIs (an Apple Music album id IS the iTunes collectionId), and
 * `catalog_item.raw` is read as an iTunes payload by link resolution
 * (`collectionViewUrl`), the creators shelf and the follow suggestion
 * (`artistId`). Emitting iTunes-shaped rows keeps every existing row, reader
 * and mapper (`toAlbumItem`, `toSongItem`, the tracklist parser) unchanged —
 * the source of a row is only visible as `raw._via = "apple-music"`.
 */

/** One Apple Music resource (`albums`, `songs`, `artists`) as JSON:API sends it. */
export interface AppleResource {
  id?: string;
  type?: string;
  attributes?: {
    name?: string;
    artistName?: string;
    albumName?: string;
    artistUrl?: string;
    url?: string;
    releaseDate?: string;
    genreNames?: string[];
    trackCount?: number;
    trackNumber?: number;
    discNumber?: number;
    durationInMillis?: number;
    contentRating?: string;
    isSingle?: boolean;
    isComplete?: boolean;
    artwork?: { url?: string };
    previews?: { url?: string }[];
    /** Absent when the item can't be played (yet): the Apple Music
     *  equivalent of iTunes' `isStreamable: false`. */
    playParams?: { id?: string; kind?: string };
  };
  relationships?: {
    tracks?: { data?: AppleResource[]; next?: string };
  };
}

/** iTunes collection row (search `entity=album`, lookup `wrapperType: "collection"`). */
export interface ItunesCollectionRow {
  wrapperType: "collection";
  collectionType: "Album";
  collectionId: number;
  collectionName: string;
  artistId?: number;
  artistName: string;
  releaseDate?: string;
  primaryGenreName?: string;
  artworkUrl100?: string;
  collectionViewUrl?: string;
  trackCount?: number;
  _via: "apple-music";
}

/** iTunes track row (search `entity=song`, lookup `wrapperType: "track"`). */
export interface ItunesTrackRow {
  wrapperType: "track";
  kind: "song";
  trackId: number;
  trackName: string;
  collectionId?: number;
  collectionName?: string;
  artistId?: number;
  artistName?: string;
  previewUrl?: string;
  trackViewUrl?: string;
  collectionViewUrl?: string;
  artworkUrl100?: string;
  trackTimeMillis?: number;
  trackNumber?: number;
  discNumber?: number;
  releaseDate?: string;
  primaryGenreName?: string;
  trackExplicitness?: string;
  isStreamable: boolean;
  _via: "apple-music";
}

/** Apple ids are decimal strings; anything else is not a catalog id. */
function numId(id: string | undefined): number | null {
  if (!id || !/^\d{1,20}$/.test(id)) return null;
  const n = Number(id);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** The trailing numeric id of an Apple Music URL path
 *  (`…/artist/czarface/740330366` → 740330366). */
export function idFromAppleUrl(url: string | undefined, kind: "artist" | "album"): number | null {
  if (!url) return null;
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    const at = parts.lastIndexOf(kind);
    if (at < 0) return null;
    return numId(parts[parts.length - 1]);
  } catch {
    return null;
  }
}

/** Apple's artwork template (`…/{w}x{h}bb.jpg`) at iTunes' 100px, so
 *  `toAlbumItem`'s `100x100bb → 600x600bb` rewrite keeps working. */
export function artwork100(template: string | undefined): string | undefined {
  if (!template) return undefined;
  return template.replace("{w}", "100").replace("{h}", "100").replace("{f}", "jpg");
}

/**
 * Apple Music's `releaseDate` is a bare calendar day (`2026-08-28`; very old
 * catalog sometimes only `1999`). iTunes stamped album days at midnight Los
 * Angeles (07:00Z / 08:00Z) — `release.ts` keeps that instant for albums, and
 * the release cron / `isUpcoming` flip on it — so the day is re-anchored
 * there, DST included. A bare year (or garbage) → undefined: no date beats a
 * wrong one, and the catalog upsert never lets a null erase a known date.
 */
export function albumDayIso(day: string | undefined): string | undefined {
  const m = day ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(day) : null;
  if (!m) return undefined;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  for (const hour of [7, 8]) {
    const t = new Date(Date.UTC(y, mo - 1, d, hour));
    if (t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return undefined;
    const la = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      hour: "numeric",
      hourCycle: "h23",
    }).format(t);
    if (Number(la) === 0) return t.toISOString().replace(".000Z", "Z");
  }
  return undefined;
}

/** `releaseDate` as iTunes would have sent it: the LA-midnight instant for a
 *  full day, the bare year as `YYYY-01-01T…` so `year` still derives. */
function itunesReleaseDate(day: string | undefined): string | undefined {
  if (day && /^\d{4}$/.test(day)) return albumDayIso(`${day}-01-01`);
  return albumDayIso(day);
}

/** Drop the `?i=trackId` a song URL carries: the album link wants the album. */
function stripTrackParam(url: string | undefined): string | undefined {
  if (!url) return url;
  try {
    const u = new URL(url);
    u.searchParams.delete("i");
    return u.toString();
  } catch {
    return url;
  }
}

/** First genre that isn't Apple's catch-all "Music". */
function primaryGenre(names: string[] | undefined): string | undefined {
  return names?.find((g) => g !== "Music") ?? names?.[0];
}

/** An Apple Music `albums` resource → iTunes collection row (null if unusable). */
export function albumToItunes(a: AppleResource): ItunesCollectionRow | null {
  const id = numId(a.id);
  const at = a.attributes;
  if (id == null || !at?.name || !at.artistName) return null;
  const artistId = idFromAppleUrl(at.artistUrl, "artist");
  return {
    wrapperType: "collection",
    collectionType: "Album",
    collectionId: id,
    collectionName: at.name,
    ...(artistId != null ? { artistId } : {}),
    artistName: at.artistName,
    releaseDate: itunesReleaseDate(at.releaseDate),
    primaryGenreName: primaryGenre(at.genreNames),
    artworkUrl100: artwork100(at.artwork?.url),
    collectionViewUrl: at.url,
    trackCount: typeof at.trackCount === "number" ? at.trackCount : undefined,
    _via: "apple-music",
  };
}

/** An Apple Music `songs` resource → iTunes track row (null if unusable). */
export function songToItunes(s: AppleResource): ItunesTrackRow | null {
  const id = numId(s.id);
  const at = s.attributes;
  if (id == null || !at?.name) return null;
  const collectionId = idFromAppleUrl(at.url, "album");
  const artistId = idFromAppleUrl(at.artistUrl, "artist");
  return {
    wrapperType: "track",
    kind: "song",
    trackId: id,
    trackName: at.name,
    ...(collectionId != null ? { collectionId } : {}),
    collectionName: at.albumName,
    ...(artistId != null ? { artistId } : {}),
    artistName: at.artistName,
    previewUrl: at.previews?.find((p) => p.url)?.url,
    trackViewUrl: at.url,
    collectionViewUrl: stripTrackParam(at.url),
    artworkUrl100: artwork100(at.artwork?.url),
    trackTimeMillis: typeof at.durationInMillis === "number" ? at.durationInMillis : undefined,
    trackNumber: at.trackNumber,
    discNumber: at.discNumber,
    releaseDate: itunesReleaseDate(at.releaseDate),
    primaryGenreName: primaryGenre(at.genreNames),
    trackExplicitness:
      at.contentRating === "explicit" ? "explicit" : at.contentRating === "clean" ? "cleaned" : "notExplicit",
    isStreamable: at.playParams != null,
    _via: "apple-music",
  };
}

/**
 * A search response's albums + songs folded the way `searchAlbums` folds
 * iTunes: album hits first, then the parent album of each song hit (Apple's
 * album index is current, but a song match still surfaces an album whose
 * TITLE didn't match — "the record with that song"). Song hits become
 * collection rows from their own album fields.
 */
export function searchToCollections(doc: {
  results?: { albums?: { data?: AppleResource[] }; songs?: { data?: AppleResource[] } };
}): ItunesCollectionRow[] {
  const out: ItunesCollectionRow[] = [];
  for (const a of doc.results?.albums?.data ?? []) {
    const row = albumToItunes(a);
    if (row) out.push(row);
  }
  for (const s of doc.results?.songs?.data ?? []) {
    const t = songToItunes(s);
    if (!t || t.collectionId == null || !t.collectionName || !t.artistName) continue;
    out.push({
      wrapperType: "collection",
      collectionType: "Album",
      collectionId: t.collectionId,
      collectionName: t.collectionName,
      ...(t.artistId != null ? { artistId: t.artistId } : {}),
      artistName: t.artistName,
      // A song's day is the SONG's (a single can predate its album): leave
      // the album dateless; getAlbumDetail fills it, as for iTunes pre-orders.
      primaryGenreName: t.primaryGenreName,
      artworkUrl100: t.artworkUrl100,
      collectionViewUrl: t.collectionViewUrl,
      _via: "apple-music",
    });
  }
  return out;
}

/** An album lookup (`/albums/{id}`, tracks included) → the rows iTunes'
 *  `lookup?id=…&entity=song` returns: the collection first, then its tracks. */
export function albumLookupToItunes(
  album: AppleResource,
  extraTracks: AppleResource[] = [],
): Array<ItunesCollectionRow | ItunesTrackRow> {
  const collection = albumToItunes(album);
  if (!collection) return [];
  const tracks = [...(album.relationships?.tracks?.data ?? []), ...extraTracks]
    // An album's tracks relationship can hold music videos too.
    .filter((t) => t.type == null || t.type === "songs")
    .map(songToItunes)
    .filter((t): t is ItunesTrackRow => t != null);
  return [collection, ...tracks];
}

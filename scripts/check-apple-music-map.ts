/**
 * Guardrail for the Apple Music → iTunes row translation (2026-10-02 catalog
 * migration). Run: `pnpm tsx scripts/check-apple-music-map.ts` — exits 1 on
 * the first failed expectation. Pure module, no DB, no network. Fixtures are
 * shaped like Apple Music API v1 catalog responses.
 */
import assert from "node:assert/strict";
import {
  albumDayIso,
  albumLookupToItunes,
  albumToItunes,
  artwork100,
  idFromAppleUrl,
  searchToCollections,
  songToItunes,
  type AppleResource,
} from "../src/modules/catalog/apple-music-map";

const ART = "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/aa/bb/cc/x.jpg/{w}x{h}bb.jpg";

const album: AppleResource = {
  id: "6779005824",
  type: "albums",
  attributes: {
    name: "Czarface Meets Frankie Pulitzer",
    artistName: "CZARFACE & Frankie Pulitzer",
    artistUrl: "https://music.apple.com/us/artist/czarface/740330366",
    url: "https://music.apple.com/us/album/czarface-meets-frankie-pulitzer/6779005824",
    releaseDate: "2026-08-28",
    genreNames: ["Hip-Hop/Rap", "Music"],
    trackCount: 15,
    artwork: { url: ART },
    playParams: { id: "6779005824", kind: "album" },
  },
};

const song = (id: string, name: string, n: number, playable = true): AppleResource => ({
  id,
  type: "songs",
  attributes: {
    name,
    albumName: "Czarface Meets Frankie Pulitzer",
    artistName: "CZARFACE & Frankie Pulitzer",
    url: `https://music.apple.com/us/album/czarface-meets-frankie-pulitzer/6779005824?i=${id}`,
    releaseDate: "2026-08-28",
    genreNames: ["Music", "Hip-Hop/Rap"],
    trackNumber: n,
    discNumber: 1,
    durationInMillis: 180000,
    contentRating: "explicit",
    artwork: { url: ART },
    previews: [{ url: "https://audio-ssl.itunes.apple.com/itunes-assets/x.m4a" }],
    ...(playable ? { playParams: { id, kind: "song" } } : {}),
  },
});

// --- ids from URLs
assert.equal(idFromAppleUrl("https://music.apple.com/us/artist/czarface/740330366", "artist"), 740330366);
assert.equal(idFromAppleUrl("https://music.apple.com/mx/album/x/6779005824?i=1", "album"), 6779005824);
assert.equal(idFromAppleUrl("https://music.apple.com/us/album/x/6779005824", "artist"), null);
assert.equal(idFromAppleUrl("not a url", "artist"), null);
assert.equal(idFromAppleUrl(undefined, "album"), null);

// --- artwork at 100px so toAlbumItem's 100x100bb → 600x600bb rewrite works
assert.equal(artwork100(ART), ART.replace("{w}x{h}", "100x100"));
assert.ok(artwork100(ART)!.endsWith("/100x100bb.jpg"));

// --- day → midnight Los Angeles (iTunes' album instant), DST-aware
assert.equal(albumDayIso("2026-08-28"), "2026-08-28T07:00:00Z"); // PDT
assert.equal(albumDayIso("2026-12-04"), "2026-12-04T08:00:00Z"); // PST
assert.equal(albumDayIso("2026-03-08"), "2026-03-08T08:00:00Z"); // DST starts later that day
assert.equal(albumDayIso("2026-02-30"), undefined);
assert.equal(albumDayIso("1999"), undefined);
assert.equal(albumDayIso(undefined), undefined);

// --- album → collection row (what raw readers need: artistId, collectionViewUrl)
const row = albumToItunes(album)!;
assert.equal(row.collectionId, 6779005824);
assert.equal(row.collectionName, "Czarface Meets Frankie Pulitzer");
assert.equal(row.artistId, 740330366);
assert.equal(row.artistName, "CZARFACE & Frankie Pulitzer");
assert.equal(row.releaseDate, "2026-08-28T07:00:00Z");
assert.equal(row.primaryGenreName, "Hip-Hop/Rap");
assert.equal(row.collectionViewUrl, album.attributes!.url);
assert.equal(row.trackCount, 15);
assert.equal(row._via, "apple-music");
// a bare year keeps the year derivable
assert.equal(albumToItunes({ ...album, attributes: { ...album.attributes, releaseDate: "1999" } })!.releaseDate, "1999-01-01T08:00:00Z");
// unusable resources
assert.equal(albumToItunes({ id: "abc", attributes: album.attributes }), null);
assert.equal(albumToItunes({ id: "1", attributes: { artistName: "x" } }), null);

// --- song → track row
const t = songToItunes(song("6779005830", "Grim-Visaged War", 3))!;
assert.equal(t.trackId, 6779005830);
assert.equal(t.collectionId, 6779005824);
assert.equal(t.trackViewUrl, song("6779005830", "", 3).attributes!.url);
assert.equal(t.collectionViewUrl, album.attributes!.url);
assert.equal(t.trackExplicitness, "explicit");
assert.equal(t.isStreamable, true);
assert.equal(t.primaryGenreName, "Hip-Hop/Rap");
assert.equal(t.previewUrl, "https://audio-ssl.itunes.apple.com/itunes-assets/x.m4a");
assert.equal(songToItunes(song("6779005831", "Track 4", 4, false))!.isStreamable, false);

// --- search fold: albums first, then song-only albums, deduped by the caller on collectionId
const folded = searchToCollections({
  results: {
    albums: { data: [album] },
    songs: {
      data: [
        song("6779005830", "Grim-Visaged War", 3),
        {
          ...song("1440000001", "Other", 1),
          attributes: { ...song("1440000001", "Other", 1).attributes, albumName: "Another Record", url: "https://music.apple.com/us/album/another/1440000000?i=1440000001" },
        },
      ],
    },
  },
});
assert.deepEqual(folded.map((r) => r.collectionId), [6779005824, 6779005824, 1440000000]);
assert.equal(folded[2].collectionName, "Another Record");
assert.equal(folded[2].releaseDate, undefined); // a song's day is not its album's
assert.equal(folded[2].collectionViewUrl, "https://music.apple.com/us/album/another/1440000000");
assert.deepEqual(searchToCollections({}), []);

// --- album lookup → iTunes lookup rows (collection first, songs only)
const lookup = albumLookupToItunes(
  {
    ...album,
    relationships: {
      tracks: {
        data: [
          song("6779005825", "Intro", 1),
          { id: "999", type: "music-videos", attributes: { name: "Video" } },
          song("6779005831", "Track 4", 4, false),
        ],
      },
    },
  },
  [song("6779005840", "Outro", 15)],
);
assert.equal(lookup[0].wrapperType, "collection");
assert.deepEqual(lookup.slice(1).map((r) => (r as { trackName: string }).trackName), ["Intro", "Track 4", "Outro"]);
assert.deepEqual(albumLookupToItunes({ id: "x" }), []);

console.log("check-apple-music-map: ok");

/**
 * Guardrail for the exact link-out matcher (brief link-out post-Odesli,
 * fase 2). Run: `pnpm tsx scripts/check-album-match.ts` — exits 1 on the
 * first failed expectation. Pure module, no DB, no network.
 */
import assert from "node:assert/strict";
import {
  impliedAlbumType,
  normalizeAlbumTitle,
  pickAlbumMatch,
  searchTitle,
  splitArtists,
} from "../src/modules/links/resolvers/match";
import type { AlbumCandidate } from "../src/modules/links/resolvers/types";

const c = (
  id: string,
  title: string,
  artists: string[],
  releaseDate: string | null = null,
  albumType: AlbumCandidate["albumType"] = "ALBUM",
): AlbumCandidate => ({ id, title, artists, releaseDate, albumType });

// --- normalization
assert.equal(normalizeAlbumTitle("Would You Ever - Single"), "would you ever");
assert.equal(normalizeAlbumTitle("Black Bear (Hushed) - EP"), "black bear hushed");
assert.equal(normalizeAlbumTitle("Un Verano Sin Ti (Deluxe Edition)"), "un verano sin ti");
assert.equal(normalizeAlbumTitle("Sorry [Explicit]"), "sorry");
assert.equal(normalizeAlbumTitle("Stadium Pow Wow (feat. Black Bear) - Single"), "stadium pow wow");
// unknown parentheticals are NOT stripped: different releases
assert.equal(normalizeAlbumTitle("Black Boy (Alternative)"), "black boy alternative");
assert.equal(normalizeAlbumTitle("Café Tacvba & Friends"), "cafe tacvba and friends");
assert.equal(searchTitle("PANTI Y COLALE 2.0 (feat. La Greña & DJ Chulo NYC) - Single"), "PANTI Y COLALE 2.0");
assert.equal(searchTitle("Black Boy (Alternative)"), "Black Boy (Alternative)");
assert.deepEqual(splitArtists("Florence + The Machine"), ["florence", "the machine"]);
assert.deepEqual(splitArtists("Dahi, Elmiene & Ravyn Lenae"), ["dahi", "elmiene", "ravyn lenae"]);
assert.deepEqual(splitArtists("Skrillex & Poo Bear"), ["skrillex", "poo bear"]);
assert.deepEqual(splitArtists("Rosalía"), ["rosalia"]);
assert.equal(impliedAlbumType("Would You Ever - Single"), "SINGLE");
assert.equal(impliedAlbumType("Black Bear (Hushed) - EP"), "EP");
assert.equal(impliedAlbumType("Motomami"), "ALBUM");

// --- exact match, no containment (the «Cars» / «Cars 2» lesson)
assert.equal(
  pickAlbumMatch(
    { title: "Cars", byline: "Various Artists", year: 2006 },
    [c("2", "Cars 2", ["Various Artists"], "2011-06-14")],
  ),
  null,
);
assert.equal(
  pickAlbumMatch(
    { title: "Cars", byline: "Various Artists", year: 2006 },
    [c("2", "Cars 2", ["Various Artists"], "2011-06-14"), c("1", "Cars", ["Various Artists"], "2006-06-06")],
  )?.id,
  "1",
);

// --- artists must match as a set (iTunes "A, B & C" vs upstream list)
assert.equal(
  pickAlbumMatch(
    { title: "Black Boy (Alternative)", byline: "Dahi, Elmiene & Ravyn Lenae", year: 2025 },
    [c("9", "Black Boy (Alternative)", ["Elmiene", "Ravyn Lenae", "Dahi"], "2025-03-01", "SINGLE")],
  )?.id,
  "9",
);
// same title, different artist → never
assert.equal(
  pickAlbumMatch(
    { title: "Motomami", byline: "Rosalía", year: 2022 },
    [c("x", "MOTOMAMI", ["Some Tribute Band"], "2022-03-18")],
  ),
  null,
);
// single lead artist credited among features is accepted ONLY with year ±1
assert.equal(
  pickAlbumMatch(
    { title: "Would You Ever - Single", byline: "Skrillex", year: 2017 },
    [c("s", "Would You Ever", ["Skrillex", "Poo Bear"], "2017-07-14", "SINGLE")],
  )?.id,
  "s",
);
assert.equal(
  pickAlbumMatch(
    { title: "Would You Ever - Single", byline: "Skrillex", year: null },
    [c("s", "Would You Ever", ["Skrillex", "Poo Bear"], "2017-07-14", "SINGLE")],
  ),
  null,
);
// missing byline or empty upstream credits → never match on title alone
assert.equal(pickAlbumMatch({ title: "Motomami", byline: null, year: 2022 }, [c("m", "Motomami", ["Rosalía"])]), null);
assert.equal(pickAlbumMatch({ title: "Motomami", byline: "Rosalía", year: 2022 }, [c("m", "Motomami", [])]), null);

// --- ranking: year proximity, then implied format, then upstream order
assert.equal(
  pickAlbumMatch(
    { title: "Greatest Hits", byline: "Queen", year: 1981 },
    [c("re", "Greatest Hits", ["Queen"], "2011-01-01"), c("og", "Greatest Hits", ["Queen"], "1981-10-26")],
  )?.id,
  "og",
);
assert.equal(
  pickAlbumMatch(
    { title: "Hello - Single", byline: "Adele", year: 2015 },
    [c("alb", "Hello", ["Adele"], "2015-10-23", "ALBUM"), c("sg", "Hello", ["Adele"], "2015-10-23", "SINGLE")],
  )?.id,
  "sg",
);
assert.equal(
  pickAlbumMatch(
    { title: "Motomami", byline: "Rosalía", year: null },
    [c("first", "MOTOMAMI", ["ROSALÍA"]), c("second", "Motomami", ["Rosalía"])],
  )?.id,
  "first",
);

// --- non-Latin scripts keep their letters (a Latin-only fold matched nothing)
assert.equal(normalizeAlbumTitle("Там, где рассвет - Single"), "там где рассвет");
assert.equal(
  pickAlbumMatch(
    { title: "Там, где рассвет - Single", byline: "Filatov & Karas & ST", year: 2026 },
    [c("ru", "Там, где рассвет", ["Filatov & Karas", "ST"], "2026-05-01", "SINGLE")],
  )?.id,
  "ru", // «Filatov & Karas» is ONE credited act upstream, two names in the byline: both sides split alike
);
// bands whose NAME carries a separator (review finding): one credited act ↔ split byline
assert.equal(
  pickAlbumMatch(
    { title: "Gratitude", byline: "Earth, Wind & Fire", year: 1975 },
    [c("ewf", "Gratitude", ["Earth, Wind & Fire"], "1975-11-11")],
  )?.id,
  "ewf",
);
assert.equal(
  pickAlbumMatch(
    { title: "Lungs", byline: "Florence + The Machine", year: 2009 },
    [c("fl", "Lungs", ["Florence and the Machine"], "2009-07-03")],
  )?.id,
  "fl",
);
assert.equal(
  pickAlbumMatch(
    { title: "VHS", byline: "X Ambassadors", year: 2015 },
    [c("xa", "VHS", ["X Ambassadors"], "2015-06-30")],
  )?.id,
  "xa",
);
assert.deepEqual(splitArtists("Filatov & Karas & ST"), ["filatov", "karas", "st"]);

// --- catalog artists ⊆ upstream credits (features in title vs credited) needs the year
assert.equal(
  pickAlbumMatch(
    { title: "PANTI Y COLALE 2.0 (feat. La Greña & DJ Chulo NYC) - Single", byline: "El Alfa, De La Ghetto & Zion", year: 2026 },
    [c("p", "PANTI Y COLALE 2.0", ["El Alfa", "De La Ghetto", "Zion", "La Greña", "DJ Chulo NYC"], "2026-04-04", "SINGLE")],
  )?.id,
  "p",
);
assert.equal(
  pickAlbumMatch(
    { title: "PANTI Y COLALE 2.0 - Single", byline: "El Alfa, De La Ghetto & Zion", year: null },
    [c("p", "PANTI Y COLALE 2.0", ["El Alfa", "De La Ghetto", "Zion", "La Greña"], "2026-04-04", "SINGLE")],
  ),
  null,
);
// upstream credits FEWER artists than the catalog names → never
assert.equal(
  pickAlbumMatch(
    { title: "YEAH!", byline: "Miles Minnick & DJ Mal-Ski", year: 2026 },
    [c("y", "YEAH!", ["Miles Minnick"], "2026-01-01", "SINGLE")],
  ),
  null,
);

console.log("check-album-match: all expectations hold");

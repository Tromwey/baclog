import type { AlbumCandidate, AlbumQuery } from "./types";

/**
 * Confident album matching for exact link-out (brief fase 2). Fail-closed:
 * a missed match degrades to the search deep link (fine), a wrong exact
 * album would send the user to someone else's record (worse than search).
 *
 * Lessons carried over from recs/linkgraph.ts's edgeTitlesMatch: NO
 * containment — «Cars» must never claim «Cars 2». Titles must be EQUAL
 * after normalization, and so must the credited artists.
 *
 * Pure and isomorphic on purpose: no "server-only", no DB types, so
 * `scripts/check-album-match.ts` can exercise it with tsx.
 */

/** Qualifiers that labels append to the same record on different stores:
 *  format suffixes ("- Single", "- EP") and bracketed editions. Only KNOWN
 *  qualifiers are stripped — a generic "(…)" strip would collapse «Black Boy
 *  (Alternative)» into «Black Boy», which are different releases. */
const FORMAT_SUFFIX = /\s*-\s*(single|ep)\s*$/i;
const EDITION_QUALIFIER =
  /\s*[([](?:[^()[\]]*\b(?:deluxe|explicit|clean|remaster(?:ed)?|edition|version|bonus|expanded|anniversary|reissue|special)\b[^()[\]]*)[)\]]/gi;
const FEAT_QUALIFIER = /\s*[([](?:feat|ft)\.?\s[^()[\]]*[)\]]/gi;

function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The title as a search term: qualifiers off, punctuation KEPT — folding
 *  «2.0» into «2 0» before sending it upstream degrades the search itself. */
export function searchTitle(title: string): string {
  return title
    .replace(FORMAT_SUFFIX, "")
    .replace(EDITION_QUALIFIER, "")
    .replace(FEAT_QUALIFIER, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeAlbumTitle(title: string): string {
  return fold(
    title
      .replace(FORMAT_SUFFIX, "")
      .replace(EDITION_QUALIFIER, "")
      .replace(FEAT_QUALIFIER, ""),
  );
}

/**
 * "A, B & C" / "A and B" / "A feat. B" → ["a", "b", "c"] (normalized).
 * Applied to BOTH sides: a band whose name carries a separator («Earth, Wind
 * & Fire», «Florence and the Machine») splits the same way whether it
 * arrives as one credited act (TIDAL) or as a byline (iTunes), so the token
 * sets still agree. Review finding: splitting only our side made every such
 * band a permanent "no match".
 */
export function splitArtists(byline: string): string[] {
  return byline
    .split(/\s*(?:,|&|\+|\band\b|\bfeat\.?\b|\bft\.?\b|\bx\b|\/)\s*/i)
    .map(fold)
    .filter(Boolean);
}

/** Format the catalog title implies, from the iTunes "- Single"/"- EP" suffix. */
export function impliedAlbumType(
  title: string,
): AlbumCandidate["albumType"] {
  const m = FORMAT_SUFFIX.exec(title);
  if (!m) return "ALBUM";
  return m[1].toLowerCase() === "ep" ? "EP" : "SINGLE";
}

function releaseYear(date: string | null): number | null {
  if (!date) return null;
  const y = Number.parseInt(date.slice(0, 4), 10);
  return Number.isFinite(y) ? y : null;
}

function isSubset(a: string[], b: string[]): boolean {
  const sb = new Set(b);
  return a.every((x) => sb.has(x));
}

/**
 * Pick the one candidate we're confident is THIS album, or null.
 *
 * Gate (all required):
 *   1. normalized titles equal (no containment);
 *   2. artist tokens (both sides through splitArtists) equal as sets — or
 *      every catalog token is credited on the candidate (the candidate may
 *      list MORE: iTunes puts features in the title, TIDAL credits them)
 *      AND the years agree (±1): exact title + every named artist + year is
 *      specific enough.
 * Unicode-aware: non-Latin titles («Там, где рассвет») keep their letters
 * (\p{L}) — a Latin-only fold turned them into "" and killed every match.
 * Rank (ties): year distance to the catalog year, then the format the
 * catalog title implies (a «… - Single» should prefer the SINGLE), then
 * upstream order (relevance).
 */
export function pickAlbumMatch(
  query: AlbumQuery,
  candidates: AlbumCandidate[],
): AlbumCandidate | null {
  const wantTitle = normalizeAlbumTitle(query.title);
  if (!wantTitle) return null;
  const wantArtists = query.byline
    ? [...new Set(splitArtists(query.byline))]
    : [];
  if (wantArtists.length === 0) return null;
  const wantType = impliedAlbumType(query.title);

  const scored: { c: AlbumCandidate; yearGap: number; typeHit: number; i: number }[] =
    [];
  candidates.forEach((c, i) => {
    if (normalizeAlbumTitle(c.title) !== wantTitle) return;
    const haveArtists = [...new Set(c.artists.flatMap(splitArtists))];
    if (haveArtists.length === 0) return;
    const cYear = releaseYear(c.releaseDate);
    const yearGap =
      query.year != null && cYear != null ? Math.abs(query.year - cYear) : null;

    const allCredited = isSubset(wantArtists, haveArtists);
    if (!allCredited) return;
    const artistsEqual = haveArtists.length === wantArtists.length;
    const sameYear = yearGap != null && yearGap <= 1;
    if (!artistsEqual && !sameYear) return;

    scored.push({
      c,
      yearGap: yearGap ?? 50,
      typeHit: c.albumType === wantType ? 0 : 1,
      i,
    });
  });
  if (scored.length === 0) return null;
  scored.sort(
    (a, b) => a.yearGap - b.yearGap || a.typeHit - b.typeHit || a.i - b.i,
  );
  return scored[0].c;
}

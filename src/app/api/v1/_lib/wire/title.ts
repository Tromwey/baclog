import { isoDate, type Release, type Title } from "../schemas";

/**
 * `Title` SUMMARY (§3) from the shared `catalog_item` facts every list query
 * already selects. Detail fields (synopsis, tracks, counts, watch…) are NOT
 * this module's job — `GET /titles/{id}` layers them on top.
 *
 * Pure: no "server-only", no DB — the wire check runs it under tsx.
 */

interface TitleSummaryFacts {
  title: string;
  mediaType: "film" | "series" | "album";
  year: number | null;
  /** `catalog_item.byline`: studio/network for video, artist for music. */
  byline: string | null;
  posterUrl: string | null;
  paletteHex: string[] | null;
}

/**
 * The catalog id arrives under two names: `id` on a bare `catalog_item` row
 * and `catalogItemId` on every JOINED row (feed events, memberships, rails,
 * recap, pool…) — where a sibling `id` is usually the membership or
 * user_item row. So `catalogItemId` WINS whenever it is present; `id` is
 * only read on rows that have no `catalogItemId` at all.
 */
export type TitleSummaryInput =
  | (TitleSummaryFacts & { catalogItemId: string; id?: string })
  | (TitleSummaryFacts & { id: string; catalogItemId?: undefined });

export function toTitleSummary(row: TitleSummaryInput): Title {
  return {
    id: row.catalogItemId ?? row.id,
    name: row.title,
    format: row.mediaType,
    year: row.year,
    creator: row.byline,
    palette: row.paletteHex ?? [],
    coverUrl: row.posterUrl,
  };
}

/**
 * `Release` from what the catalog knows. A `releaseDate` is ALWAYS a `day`
 * (past or future — the app compares with its own clock to decide "no puede
 * esperar"); a bare `year` is a `year` anchored on Jan 1 UTC; nothing → null.
 * The derivation never looks at the clock, so a cached row serializes the
 * same whoever asks and whenever.
 */
export function releaseOf(
  releaseDate: Date | string | null,
  year: number | null,
): Release | null {
  if (releaseDate !== null && releaseDate !== undefined) {
    const d = releaseDate instanceof Date ? releaseDate : new Date(releaseDate);
    if (!Number.isNaN(d.getTime())) return { kind: "day", date: isoDate(d) };
  }
  if (year !== null && year !== undefined && Number.isFinite(year)) {
    return { kind: "year", date: isoDate(new Date(Date.UTC(year, 0, 1))) };
  }
  return null;
}

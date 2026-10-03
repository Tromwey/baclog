import { redactedError } from "@/authz/safe-log";
import { z } from "zod";
import { ApiError, withApi } from "@/authz/api";
import {
  CINE_MOODS,
  CINE_TIMES,
  GENRE_ES,
  MUSIC_MOODS,
  SERIES_LENSES,
  inCineMood,
  inMusicMood,
  type CineTime,
  type ShelfWork,
} from "@/modules/catalog/format-moods";
import { getCineShelf, getMaratonShelf, getMusicShelf } from "@/modules/catalog/format-shelves";
import type { MediaType } from "@/modules/catalog/types";
import { getKuradas, type KuradaCard } from "@/modules/social/kurada";
import { releaseDatesFor } from "../../../_lib/catalog";
import { json, readQuery } from "../../../_lib/http";
import { toCollectionCardWire, toTitleSummary } from "../../../_lib/wire";

/**
 * GET /api/v1/discover/formats/{film|series|album} (§4 Descubrir · por
 * formato — Claude Design "Descubrir Final – Formatos" 2a–2c). The same
 * shelves the web's format pages read (`modules/catalog/format-shelves.ts`)
 * plus that format's Colecciones Kuradas (`modules/social/kurada.ts`,
 * gated `publicAuthor` + blocks + `backlog.is_public`).
 *
 * The vocabularies (times, lenses, moods and their tones) travel IN the
 * response and each title carries the mood indices it belongs to, so the app
 * never re-implements the genre mapping — `format-moods.ts` stays the one
 * copy. `?time=0|1|2` picks cine's runtime window (default 1, "hasta dos
 * horas"). An unknown format is a 404 (path posture), a bad `time` a 400.
 *
 * Failure posture. A shelf THROWS when it could not answer: its provider
 * failed every call (`ShelfUnavailableError` — before 2026-10-01 that came
 * back as an empty shelf), the catalog write, the DB. The throw is logged
 * with the format and the response degrades to `titles: []` while there are
 * Kuradas to show — and says so: `titlesUnavailable: true` (ADDITIVE; the
 * key is ABSENT when the shelf answered, even with nothing), so a client
 * doesn't cache "this format has no titles" for a shelf that never ran. When the shelf threw AND there is nothing else in the
 * response (no Kuradas), the failure is total: 503 `unavailable`, the same
 * answer `/search` gives when every provider failed, so the app shows
 * "inténtalo más tarde" instead of an empty page that reads as "no hay
 * nada". The web actions (`discover-format-actions.ts`) throw on the same
 * condition; a shelf that answered with nothing is `titles: []` on both.
 */

/** Runs a shelf; a throw is logged and reported, never swallowed. */
async function shelfOf<T>(format: MediaType, run: () => Promise<T[]>): Promise<{ rows: T[]; failed: boolean }> {
  try {
    return { rows: await run(), failed: false };
  } catch (err) {
    console.error(`[discover/formats] shelf "${format}" failed:`, redactedError(err));
    return { rows: [], failed: true };
  }
}

const QuerySchema = z.object({
  time: z.coerce.number().int().min(0).max(2).optional(),
});

const FORMATS = new Set<MediaType>(["film", "series", "album"]);

/** Spread into the response: the marker of a shelf that threw, or nothing. */
const unavailable = (failed: boolean) => (failed ? { titlesUnavailable: true as const } : {});

const kuradaOut = (k: KuradaCard) => ({ ...toCollectionCardWire(k), curator: k.curator });

export const GET = withApi<{ format: string }>(async (req, { user, params }) => {
  const format = params.format as MediaType;
  if (!FORMATS.has(format)) throw new ApiError("not_found");
  const { time = 1 } = readQuery(req, QuerySchema);

  const kuradasP = getKuradas(user.id).then((k) => k[format].map(kuradaOut));
  /** The Kuradas — or 503 when the shelf failed and they are empty too. */
  const kuradasOr503 = async (shelfFailed: boolean) => {
    const kuradas = await kuradasP;
    if (shelfFailed && kuradas.length === 0) throw new ApiError("unavailable");
    return kuradas;
  };
  const summaries = async <T extends ShelfWork>(rows: T[]) => {
    const releaseOf = await releaseDatesFor(rows.map((r) => r.catalogItemId));
    return (r: T) => toTitleSummary({ ...r, releaseDate: releaseOf(r.catalogItemId) });
  };

  if (format === "film") {
    const { rows: films, failed } = await shelfOf(format, () => getCineShelf(time as CineTime, Date.now()));
    const kuradas = await kuradasOr503(failed);
    const title = await summaries(films);
    return json({
      format,
      time,
      times: CINE_TIMES.map(({ label, sub }) => ({ label, sub })),
      moods: CINE_MOODS.map(({ label, hexes }) => ({ label, palette: hexes })),
      titles: films.map((f) => ({
        title: title(f),
        runtimeMinutes: f.runtime,
        inCinemas: f.inCinemas,
        genre: f.genre ? (GENRE_ES[f.genre] ?? null) : null,
        moods: CINE_MOODS.flatMap((_, i) => (inCineMood(i, f) ? [i] : [])),
      })),
      kuradas,
      ...unavailable(failed),
    });
  }

  if (format === "series") {
    const { rows: series, failed } = await shelfOf(format, getMaratonShelf);
    const kuradas = await kuradasOr503(failed);
    const title = await summaries(series);
    return json({
      format,
      lenses: SERIES_LENSES.map(({ label, sub, maxMinutes }) => ({ label, sub, maxMinutes })),
      titles: series.map((s) => ({
        title: title(s),
        minutes: s.minutes,
        episodes: s.episodes,
        network: s.network,
      })),
      kuradas,
      ...unavailable(failed),
    });
  }

  const { rows: albums, failed } = await shelfOf(format, getMusicShelf);
  const kuradas = await kuradasOr503(failed);
  const title = await summaries(albums);
  return json({
    format,
    moods: MUSIC_MOODS.map(({ label, hexes }) => ({ label, palette: hexes })),
    titles: albums
      .map((a) => ({ title: title(a), moods: MUSIC_MOODS.flatMap((_, i) => (inMusicMood(i, a.genre) ? [i] : [])) }))
      .filter((a) => a.moods.length > 0),
    kuradas,
    ...unavailable(failed),
  });
});

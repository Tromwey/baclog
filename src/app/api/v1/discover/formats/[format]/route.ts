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
 * Provider failure = empty `titles`, never an error (fail-open like the web).
 */

const QuerySchema = z.object({
  time: z.coerce.number().int().min(0).max(2).optional(),
});

const FORMATS = new Set<MediaType>(["film", "series", "album"]);

const kuradaOut = (k: KuradaCard) => ({ ...toCollectionCardWire(k), curator: k.curator });

export const GET = withApi<{ format: string }>(async (req, { user, params }) => {
  const format = params.format as MediaType;
  if (!FORMATS.has(format)) throw new ApiError("not_found");
  const { time = 1 } = readQuery(req, QuerySchema);

  const kuradas = getKuradas(user.id).then((k) => k[format].map(kuradaOut));
  const summaries = async <T extends ShelfWork>(rows: T[]) => {
    const releaseOf = await releaseDatesFor(rows.map((r) => r.catalogItemId));
    return (r: T) => toTitleSummary({ ...r, releaseDate: releaseOf(r.catalogItemId) });
  };

  if (format === "film") {
    const films = await getCineShelf(time as CineTime, Date.now()).catch(() => []);
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
      kuradas: await kuradas,
    });
  }

  if (format === "series") {
    const series = await getMaratonShelf().catch(() => []);
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
      kuradas: await kuradas,
    });
  }

  const albums = await getMusicShelf().catch(() => []);
  const title = await summaries(albums);
  return json({
    format,
    moods: MUSIC_MOODS.map(({ label, hexes }) => ({ label, palette: hexes })),
    titles: albums
      .map((a) => ({ title: title(a), moods: MUSIC_MOODS.flatMap((_, i) => (inMusicMood(i, a.genre) ? [i] : [])) }))
      .filter((a) => a.moods.length > 0),
    kuradas: await kuradas,
  });
});

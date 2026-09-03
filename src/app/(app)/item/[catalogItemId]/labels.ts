import type { MediaType } from "@/modules/catalog/types";

/**
 * The item detail's own vocabulary (Revamp UI 06/08, 2026-09-03). Plain module
 * — the server page and the client sheets both read it, so it can't live in a
 * "use client" file.
 */

/** The kind as the mock's meta line says it: "Cine · 2023 · …". */
export const KIND_LABEL: Record<MediaType, string> = {
  film: "Cine",
  series: "Serie",
  album: "Álbum",
};

/** "vista el 2 sep" for cine/series, "escuchado el 2 sep" for an album. */
export const DONE_VERB: Record<MediaType, string> = {
  film: "vista",
  series: "vista",
  album: "escuchado",
};

export type MusicService = "spotify" | "apple_music" | "youtube_music" | "tidal";

/** Same labels as onboarding/ajustes — the "Reproducir en …" button. */
export const SERVICE_LABEL: Record<MusicService, string> = {
  spotify: "Spotify",
  apple_music: "Apple Music",
  youtube_music: "YouTube Music",
  tidal: "TIDAL",
};

/** "2 sep" — today, es-MX, for the Completar sheet's "vista el …". */
export function todayShort(now = new Date()): string {
  return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" })
    .format(now)
    .replace(".", "");
}

/**
 * The ficha's own vocabulary. Plain module — the server page and the client
 * sheets both read it, so it can't live in a "use client" file.
 */

export type MusicService = "spotify" | "apple_music" | "youtube_music" | "tidal";

/** Same labels as onboarding/ajustes — "Abrir en …" (24c). */
export const SERVICE_LABEL: Record<MusicService, string> = {
  spotify: "Spotify",
  apple_music: "Apple Music",
  youtube_music: "YouTube Music",
  tidal: "TIDAL",
};

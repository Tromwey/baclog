import type { PartyPerson } from "@/modules/party-collections/types";

/**
 * "Llévala a otra app" — shapes shared by the module, the web actions and
 * the API v1 wire (`api/v1/_lib/wire/music.ts`). Client-safe (types only).
 * Contract: `.claude/knowledge/state/export-contract.md`.
 */

export type MusicProvider = "apple_music" | "tidal";

export const MUSIC_PROVIDERS: readonly MusicProvider[] = ["apple_music", "tidal"];

/** `GET /api/v1/music/services` — what the export sheet can offer. */
export interface MusicServices {
  /**
   * `available` = iOS (native MusicKit) may offer it; `webAvailable` = the web
   * (MusicKit JS) may — it also needs the dedicated web key. `reason` explains
   * `available: false`.
   */
  apple_music: { available: boolean; webAvailable: boolean; reason?: "not_configured" | "key_rejected" };
  tidal: { available: boolean; connected: boolean; reason?: "not_configured" };
}

export type ExportSongState = "pending" | "added" | "missing";

export interface ExportSong {
  titleId: string;
  title: string;
  artist: string | null;
  album: string | null;
  artworkUrl: string | null;
  durationMs: number | null;
  /** Apple Music catalog id (= the iTunes trackId, storefront mx). */
  appleMusicId: string | null;
  /** ISRC when known (Apple catalog lookup, cached on the song). */
  isrc: string | null;
  state: ExportSongState;
  /** Who put it — null = "Puso alguien" (same identity gate as the party). */
  addedBy: PartyPerson | null;
  /** The viewer put it ("Pusiste"). */
  mine: boolean;
}

export interface ExportState {
  provider: MusicProvider;
  /** The playlist is called like the party. */
  playlistName: string;
  /** idle = never started · in_progress = songs left · done = nothing pending. */
  status: "idle" | "in_progress" | "done";
  /** Songs in the party right now. */
  total: number;
  /** Songs already in the remote playlist ("N de M canciones ya están…"). */
  exported: number;
  /** exported + missing: drives the progress bar. */
  processed: number;
  /** Next song to be searched ("Buscando {title} en {svc}…"); null when done. */
  current: { titleId: string; title: string; artist: string | null } | null;
  /** The remote playlist, once created. `url` = "Abrir en {svc}". */
  playlist: { id: string; url: string | null } | null;
  /** "No están en {svc}", in party order. */
  missing: ExportSong[];
  /** Every song in party order with its state (the Apple Music client uses it). */
  songs: ExportSong[];
  /** Another step of this export is running right now: wait ~1 s and call again. */
  busy: boolean;
}

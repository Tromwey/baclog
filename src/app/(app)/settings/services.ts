/**
 * The music apps "Abrir en" can open (users.preferredService). Plain module:
 * the Ajustes page (server) prints the label, the picker (client) lists them.
 */
export const SERVICES = [
  { id: "spotify", label: "Spotify" },
  { id: "apple_music", label: "Apple Music" },
  { id: "youtube_music", label: "YouTube Music" },
  { id: "tidal", label: "TIDAL" },
] as const;

export type ServiceId = (typeof SERVICES)[number]["id"];

export const SERVICE_LABEL: Record<ServiceId, string> = Object.fromEntries(
  SERVICES.map((s) => [s.id, s.label]),
) as Record<ServiceId, string>;

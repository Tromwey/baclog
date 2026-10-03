import "server-only";
import { appleMusicProbe } from "./apple-music";
import { tidalOAuthConfig } from "./config";
import { isTidalConnected } from "./tidal-auth";
import type { MusicServices } from "./types";

/**
 * `GET /api/v1/music/services` / `getMusicServicesAction` — what the export
 * sheet can offer to THIS user. `available: false` = "Próximamente" (the
 * deploy lacks the env, or Apple rejected the key), never an error.
 * `tidal.connected` = there is a stored link (it may still turn out dead on
 * the next refresh → `not_connected` then).
 */
export async function musicServicesFor(userId: string): Promise<MusicServices> {
  const tidalReady = tidalOAuthConfig() !== null;
  const [apple, connected] = await Promise.all([
    appleMusicProbe(),
    tidalReady ? isTidalConnected(userId) : Promise.resolve(false),
  ]);
  return {
    apple_music: apple,
    tidal: tidalReady ? { available: true, connected } : { available: false, connected, reason: "not_configured" },
  };
}

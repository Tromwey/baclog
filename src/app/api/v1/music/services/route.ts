import { withApi } from "@/authz/api";
import { musicServicesFor } from "@/modules/music-export/services";
import { json } from "../../_lib/http";
import { MusicServicesSchema } from "../../_lib/schemas";

/**
 * GET /api/v1/music/services → `MusicServices` ("Llévala a otra app" sheet):
 * `{ apple_music: { available, reason? }, tidal: { available, connected, reason? } }`.
 * `available: false` → "Próximamente". 503 `unavailable` while 0034 isn't live.
 */
export const GET = withApi(async (_req, { user }) => {
  return json(MusicServicesSchema.parse(await musicServicesFor(user.id)));
});

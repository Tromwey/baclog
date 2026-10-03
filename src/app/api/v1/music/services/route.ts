import { withApi } from "@/authz/api";
import { parseOutput } from "@/lib/output";
import { musicServicesFor } from "@/modules/music-export/services";
import { json } from "../../_lib/http";
import { MusicServicesSchema } from "../../_lib/schemas";

/**
 * GET /api/v1/music/services → `MusicServices` ("Llévala a otra app" sheet):
 * `{ apple_music: { available, reason? }, tidal: { available, connected, reason? } }`.
 * `available: false` → "Próximamente".
 */
export const GET = withApi(async (_req, { user }) => {
  return json(parseOutput(MusicServicesSchema, await musicServicesFor(user.id), "MusicServices"));
});

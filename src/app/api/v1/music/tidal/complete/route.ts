import { withApi } from "@/authz/api";
import { musicServicesFor } from "@/modules/music-export/services";
import { completeTidalAuth } from "@/modules/music-export/tidal-auth";
import { json, readJson } from "../../../_lib/http";
import { MusicServicesSchema, TidalCompleteBodySchema } from "../../../_lib/schemas";

/**
 * POST /api/v1/music/tidal/complete `{ ref }` → `MusicServices` (with
 * `tidal.connected: true`). Finishes the iOS link: the bearer must be the
 * user who called `/music/tidal/start` (an authorization parked for someone
 * else is the same 409). 409 `conflict` + reason `auth_expired` = expired,
 * used, or not yours → start again. 503 `service_failed` = TIDAL down.
 */
export const POST = withApi(async (req, { user }) => {
  const body = await readJson(req, TidalCompleteBodySchema);
  await completeTidalAuth(user.id, body.ref);
  return json(MusicServicesSchema.parse(await musicServicesFor(user.id)));
});

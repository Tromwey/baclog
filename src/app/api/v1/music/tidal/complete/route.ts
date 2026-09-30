import { withApi } from "@/authz/api";
import { musicServicesFor } from "@/modules/music-export/services";
import { completeTidalAuth } from "@/modules/music-export/tidal-auth";
import { json, readJson } from "../../../_lib/http";
import { MusicServicesSchema, TidalCompleteBodySchema } from "../../../_lib/schemas";

/**
 * POST /api/v1/music/tidal/complete `{ ref, claim }` → `MusicServices` (with
 * `tidal.connected: true`). Finishes the iOS link: both values come from the
 * `kura://music/tidal/authorized?ref=…&claim=…` bounce, and the bearer must
 * be the user who called `/music/tidal/start`. A wrong/missing claim or
 * someone else's bearer is the same 409 `conflict` + reason `auth_expired`
 * (as expired or used) and does NOT burn the owner's parked code → start
 * again. A body without `claim` is that same 409 (not a 400: no oracle for
 * "the ref exists"). 503 `service_failed` = TIDAL down.
 */
export const POST = withApi(async (req, { user }) => {
  const body = await readJson(req, TidalCompleteBodySchema);
  await completeTidalAuth(user.id, body.ref, body.claim ?? "");
  return json(MusicServicesSchema.parse(await musicServicesFor(user.id)));
});

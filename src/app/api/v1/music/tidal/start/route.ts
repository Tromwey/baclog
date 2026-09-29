import { withApi } from "@/authz/api";
import { startTidalAuth } from "@/modules/music-export/tidal-auth";
import { json } from "../../../_lib/http";

/**
 * POST /api/v1/music/tidal/start → `{ authorizeUrl }` (iOS). Open it in
 * `ASWebAuthenticationSession(url:, callbackURLScheme: "kura")`. TIDAL
 * redirects to our callback, which bounces to
 *   `kura://music/tidal/authorized?ref=<ref>`  → POST /music/tidal/complete { ref }
 *   `kura://music/tidal/connected?ok=0&reason=denied|expired|unavailable`
 * The state expires in 10 minutes and is bound to THIS bearer's user.
 * 503 `unavailable` + `not_configured` when TIDAL OAuth isn't set up;
 * 429 after 10 starts/min.
 */
export const POST = withApi(async (_req, { user }) => {
  return json({ authorizeUrl: await startTidalAuth(user.id, "ios", null) });
});

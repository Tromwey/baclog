import { ApiError, checkRateLimit, withApi } from "@/authz/api";
import { appleWebDeveloperToken } from "@/modules/music-export/apple-music";
import { isoDate } from "../../../_lib/schemas";
import { json } from "../../../_lib/http";

/**
 * GET /api/v1/music/apple/developer-token → `{ token, expiresAt }`.
 * The BROWSER's MusicKit developer token (ES256, 1 h, `origin`-bound to
 * get-kura.app / beta — Apple refuses it from any other page). Public by
 * design — MusicKit JS ships it to every browser — so it is the one
 * credential a response may carry; the server's own origin-less token never
 * leaves it. Bearer-gated anyway and limited to 30/min per user. The iOS app
 * doesn't need it (MusicKit on iOS mints its own); it's here for parity.
 * 503 `unavailable` + reason `not_configured` without the dedicated MusicKit
 * key OR when Apple rejected it (`services.apple_music.reason: key_rejected`).
 */
export const GET = withApi(async (_req, { user }) => {
  const rl = checkRateLimit(`apple-dev-token:${user.id}`, 30);
  if (!rl.ok) throw new ApiError("rate_limited", undefined, { retryAfterSeconds: rl.retryAfterSeconds });
  const dev = await appleWebDeveloperToken();
  return json({ token: dev.token, expiresAt: isoDate(dev.expiresAt) });
});

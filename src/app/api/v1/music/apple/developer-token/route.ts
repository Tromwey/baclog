import { ApiError, checkRateLimit, withApi } from "@/authz/api";
import { appleDeveloperToken } from "@/modules/music-export/apple-music";
import { assertMusicExportLive, notConfigured } from "@/modules/music-export/errors";
import { isoDate } from "../../../_lib/schemas";
import { json } from "../../../_lib/http";

/**
 * GET /api/v1/music/apple/developer-token → `{ token, expiresAt }`.
 * The MusicKit developer token (ES256, 12 h). PUBLIC BY DESIGN — MusicKit
 * JS ships it to every browser — so it is the one credential a response may
 * carry. Bearer-gated anyway (only Kura users mint our quota) and limited to
 * 30/min per user. The iOS app doesn't need it (MusicKit on iOS generates its
 * own from the App ID's MusicKit service); it's here for parity and tests.
 * 503 `unavailable` + reason `not_configured` without a MusicKit key.
 */
export const GET = withApi(async (_req, { user }) => {
  assertMusicExportLive();
  const rl = checkRateLimit(`apple-dev-token:${user.id}`, 30);
  if (!rl.ok) throw new ApiError("rate_limited", undefined, { retryAfterSeconds: rl.retryAfterSeconds });
  const dev = await appleDeveloperToken();
  if (!dev) throw notConfigured("apple_music");
  return json({ token: dev.token, expiresAt: isoDate(dev.expiresAt) });
});

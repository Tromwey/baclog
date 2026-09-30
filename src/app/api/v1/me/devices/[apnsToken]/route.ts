import { MIGRATION_0035_LIVE } from "@/auth/live-0035";
import { ApiError, withApi } from "@/authz/api";
import {
  deviceTokenCandidates,
  parseDeviceToken,
  registerDeviceToken,
  unregisterDeviceToken,
} from "@/modules/push/devices";
import { NOTIFICATIONS_UNAVAILABLE, requireMigration0029 } from "../../../_lib/devices";
import { noContent, readJson } from "../../../_lib/http";
import { DeviceTokenBodySchema } from "../../../_lib/schemas";

/** The path segment keeps its 4e name (`apnsToken`) — it is internal; the
 *  URL is `/me/devices/{token}` for both providers. */
type Params = { apnsToken: string };

function invalidToken(): ApiError {
  return new ApiError("invalid", undefined, {
    fields: { token: "El token del dispositivo no es válido." },
  });
}

/** 503 while migration 0035 (`device_token.provider`) is not applied: the
 *  Android app keeps its token and retries on the next launch. */
const FCM_PENDING_MESSAGE =
  "Las notificaciones en Android todavía no están disponibles. Inténtalo más tarde.";

/**
 * PUT /api/v1/me/devices/{token} { environment?: "sandbox"|"production",
 * provider?: "apns"|"fcm" } → 204 (phase 4e; `provider` since 2026-09-30).
 * Registers this install's push token for the caller, bound to the bearer's
 * device session (`sid`; null for a pre-4d bearer), so revoking that session
 * or logging out deletes it. A token already held by ANOTHER account moves
 * to the caller (the phone changed hands / users). Upsert: repeating is
 * harmless.
 *   provider "apns" (default — every iOS build): `environment` required;
 *     token = hex 64..200 (stored lowercase).
 *   provider "fcm" (Android): `environment` ignored; token = the FCM
 *     registration token as sent (`[A-Za-z0-9_:-]{32,1024}`).
 * A token of the wrong shape → 400 `fields.token` (it is the app's own
 * value, not a lookup — nothing to enumerate). 503 `unavailable` until
 * migration 0029; for "fcm", 503 `unavailable` + `reason: "fcm_pending"`
 * until migration 0035 (`MIGRATION_0035_LIVE`) — nothing is written.
 */
export const PUT = withApi<Params>(async (request, { user, params, bearer }) => {
  requireMigration0029(NOTIFICATIONS_UNAVAILABLE);
  const { environment, provider } = await readJson(request, DeviceTokenBodySchema);
  if (provider === "fcm" && !MIGRATION_0035_LIVE) {
    throw new ApiError("unavailable", FCM_PENDING_MESSAGE, { reason: "fcm_pending" });
  }
  const token = parseDeviceToken(params.apnsToken, provider);
  if (!token) throw invalidToken();
  // The schema guarantees `environment` for APNs; FCM rows store a constant.
  await registerDeviceToken(user.id, bearer.claims.sid, token, provider, environment ?? "production");
  return noContent();
});

/**
 * DELETE /api/v1/me/devices/{token} → 204, idempotent, no body (either
 * provider: the token's shape says which forms to try). Deletes the row only
 * if it is the caller's; unknown or another account's = the same 204. Not a
 * token of either shape → 400 `fields.token`. Works before 0035 too (an FCM
 * token just matches nothing).
 */
export const DELETE = withApi<Params>(async (_request, { user, params }) => {
  requireMigration0029(NOTIFICATIONS_UNAVAILABLE);
  const candidates = deviceTokenCandidates(params.apnsToken);
  if (candidates.length === 0) throw invalidToken();
  await unregisterDeviceToken(user.id, candidates);
  return noContent();
});

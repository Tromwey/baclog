import { ApiError, withApi } from "@/authz/api";
import {
  parseApnsToken,
  registerDeviceToken,
  unregisterDeviceToken,
} from "@/modules/push/devices";
import { NOTIFICATIONS_UNAVAILABLE, requireMigration0029 } from "../../../_lib/devices";
import { noContent, readJson } from "../../../_lib/http";
import { DeviceTokenBodySchema } from "../../../_lib/schemas";

function tokenOf(raw: string | string[] | undefined): string {
  const token = parseApnsToken(raw);
  if (!token) {
    throw new ApiError("invalid", undefined, {
      fields: { token: "El token del dispositivo no es válido." },
    });
  }
  return token;
}

/**
 * PUT /api/v1/me/devices/{apnsToken} { environment: "sandbox"|"production" }
 * → 204 (phase 4e). Registers this install's APNs token for the caller,
 * bound to the bearer's device session (`sid`; null for a pre-4d bearer),
 * so revoking that session or logging out deletes it. A token already held
 * by ANOTHER account moves to the caller (the phone changed hands / users).
 * Upsert: repeating is harmless. Not hex 64..200 → 400 `fields.token`
 * (it is the app's own value, not a lookup — nothing to enumerate).
 * 503 `unavailable` until migration 0029.
 */
export const PUT = withApi<{ apnsToken: string }>(async (request, { user, params, bearer }) => {
  requireMigration0029(NOTIFICATIONS_UNAVAILABLE);
  const token = tokenOf(params.apnsToken);
  const { environment } = await readJson(request, DeviceTokenBodySchema);
  await registerDeviceToken(user.id, bearer.claims.sid, token, environment);
  return noContent();
});

/**
 * DELETE /api/v1/me/devices/{apnsToken} → 204, idempotent. Deletes the row
 * only if it is the caller's; unknown or another account's = the same 204.
 */
export const DELETE = withApi<{ apnsToken: string }>(async (_request, { user, params }) => {
  requireMigration0029(NOTIFICATIONS_UNAVAILABLE);
  await unregisterDeviceToken(user.id, tokenOf(params.apnsToken));
  return noContent();
});

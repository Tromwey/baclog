import {
  LEGACY_DEVICE,
  createMobileSession,
  updateMobileSessionDevice,
} from "@/auth/mobile-sessions";
import {
  MOBILE_TOKEN_REFRESH_WINDOW_SECONDS,
  issueMobileToken,
  withApi,
} from "@/authz/api";
import { json, readOptionalJson } from "../../_lib/http";
import { buildMe } from "../../_lib/me";
import { RefreshBodySchema, type AuthSession } from "../../_lib/schemas";

/**
 * POST /api/v1/auth/refresh (bearer) { device? } → { token, user: Me } (§2.1).
 *
 * Rotation happens ONLY inside the token's last 7 days
 * (`MOBILE_TOKEN_REFRESH_WINDOW_SECONDS`): then the caller gets a fresh
 * 30-day token with a new `jti`, minted at the account's CURRENT
 * `token_version` (= the bearer's `tv`: `withApi` has just checked they
 * match) and the SAME `sid`. Earlier, the SAME token comes back (with the
 * same fresh `Me`) — the app calls this on every launch, and minting a new
 * 30-day token each time would keep an unbounded number of them alive. The
 * old token is not revoked by a refresh; it dies at its own `exp`, at the
 * next `auth/logout` of the account, or when its session is revoked.
 *
 * Phase 4d: a pre-4d bearer (no `sid`) is UPGRADED here, whatever its age —
 * a `mobile_session` row is created (from the optional `device` body, else
 * "iPhone" / version "desconocida") and a new token with that `sid` comes
 * back, so every install shows up in `GET /me/sessions` after its next
 * launch. A bearer that already has `sid` and sends `device` refreshes the
 * session's name/version (an app update). The body is optional: no body,
 * `{}` and `{ device }` are all valid.
 */
export const POST = withApi(async (request, { user, bearer }) => {
  const { device } = await readOptionalJson(request, RefreshBodySchema);
  const { sid, tv, exp } = bearer.claims;

  let token = bearer.token;
  if (sid) {
    if (device) await updateMobileSessionDevice(user.id, sid, device);
    const remaining = exp - Math.floor(Date.now() / 1000);
    if (remaining < MOBILE_TOKEN_REFRESH_WINDOW_SECONDS) {
      token = await issueMobileToken(user.id, tv, sid);
    }
  } else {
    // null while migration 0029 is not live: the legacy token then follows
    // the plain 4b window rule below.
    const newSid = await createMobileSession(user.id, device ?? LEGACY_DEVICE);
    const remaining = exp - Math.floor(Date.now() / 1000);
    if (newSid || remaining < MOBILE_TOKEN_REFRESH_WINDOW_SECONDS) {
      token = await issueMobileToken(user.id, tv, newSid);
    }
  }
  const body: AuthSession = { token, user: await buildMe(user) };
  return json(body);
});

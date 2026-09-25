import { logoutEverywhere } from "@/auth/mobile-sessions";
import { withApi } from "@/authz/api";
import { noContent } from "../../_lib/http";

/**
 * POST /api/v1/auth/logout (bearer) → 204 — "cerrar sesión en todos lados"
 * (phase 4b, §2.1; the founder kept the account-wide meaning when per-device
 * sessions arrived in 4d — revoking ONE device is `DELETE /me/sessions/{id}`).
 *
 * One transaction (`logoutEverywhere`): `users.token_version + 1` — every
 * bearer of the account, pending web handoffs and every web Auth.js cookie
 * die (they all carry `tv`) — plus, since 4d, every `mobile_session` stamped
 * revoked and every `device_token` of the account deleted, so no phone keeps
 * receiving pushes for an account it is no longer signed in to.
 *
 * Idempotent in effect: calling it again with a fresh token bumps again
 * (same outcome: everything before is dead); calling it with the token it
 * just killed is the uniform 401.
 */
export const POST = withApi(async (_request, { user }) => {
  await logoutEverywhere(user.id);
  return noContent();
});

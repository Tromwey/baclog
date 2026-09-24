import { bumpTokenVersion } from "@/auth/user-row";
import { withApi } from "@/authz/api";
import { noContent } from "../../_lib/http";

/**
 * POST /api/v1/auth/logout (bearer) → 204 — "cerrar sesión en todos lados"
 * (phase 4b, §2.1).
 *
 * Bumps `users.token_version` in ONE atomic statement (`bumpTokenVersion`). Every bearer carries
 * the version it was minted at (`tv`) and `withApi` compares it with the row
 * on every request, so from this instant EVERY bearer of the account — this
 * device's and any other's — is the same 401 as no bearer, and pending web
 * handoffs die too — and so does every web Auth.js cookie of the account
 * (it carries `tv` as well; `getCurrentUser` compares it), including the one
 * a handoff opened in the app's SFSafariViewController. It is ACCOUNT-level,
 * not device-level: there is no session/device table. (The web's own
 * "cerrar sesión" only clears that browser's cookie; it does not bump.)
 *
 * Idempotent in effect: calling it again with a fresh token bumps again
 * (same outcome: everything before is dead); calling it with the token it
 * just killed is the uniform 401.
 */
export const POST = withApi(async (_request, { user }) => {
  // No-op until migration 0027 is live (TOKEN_VERSION_LIVE in user-row.ts).
  await bumpTokenVersion(user.id);
  return noContent();
});

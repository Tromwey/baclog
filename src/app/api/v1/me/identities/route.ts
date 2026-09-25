import { isAppleRelayEmail, linkedProviders } from "@/auth/social";
import { withApi } from "@/authz/api";
import { json } from "../../_lib/http";
import { appleSignInEnabled, googleIosClientId } from "../../_lib/social";
import type { Identities } from "../../_lib/schemas";

/**
 * GET /api/v1/me/identities → { email, emailIsRelay, providers: [{ provider, linked }] }
 * (phase 4g). The ways into the caller's account: its email (always — a
 * code by mail) and each provider ENABLED on this deploy (the same rule as
 * `auth/providers`: Apple unless `AUTH_APPLE_DISABLED`, Google only with
 * `GOOGLE_IOS_CLIENT_ID`), `linked` = an `account` row of that provider
 * belongs to the caller. A provider switched off is not listed even if the
 * account has a link to it. `emailIsRelay` = the email is an Apple private
 * relay: the app explains before offering to disconnect Apple (see
 * `DELETE /me/identities/apple` → 409 `last_way_in`).
 */
export const GET = withApi(async (_request, { user }) => {
  const linked = await linkedProviders(user.id);
  const providers: Identities["providers"] = [];
  if (appleSignInEnabled()) providers.push({ provider: "apple", linked: linked.has("apple") });
  if (googleIosClientId()) providers.push({ provider: "google", linked: linked.has("google") });
  const body: Identities = { email: user.email, emailIsRelay: isAppleRelayEmail(user.email), providers };
  return json(body);
});

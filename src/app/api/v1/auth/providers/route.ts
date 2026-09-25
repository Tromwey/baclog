import { withPublicApi } from "@/authz/api";
import { json } from "../../_lib/http";
import { appleSignInEnabled, googleIosClientId } from "../../_lib/social";
import type { AuthProviders } from "../../_lib/schemas";

/**
 * GET /api/v1/auth/providers (public) → { apple: boolean, google: { clientId } | null }
 * (phase 4f). Which social sign-in buttons the app may paint — only the ones
 * that work on this deploy. `apple` is true unless the `AUTH_APPLE_DISABLED`
 * kill-switch is set (verifying an Apple identity token needs no key);
 * `google` is null without `GOOGLE_IOS_CLIENT_ID`. The Google client id is
 * not a secret (it ships inside every iOS build). Rate limited by IP like
 * the rest of the public `auth/*`.
 */
export const GET = withPublicApi(async () => {
  const clientId = googleIosClientId();
  const body: AuthProviders = {
    apple: appleSignInEnabled(),
    google: clientId ? { clientId } : null,
  };
  return json(body);
});

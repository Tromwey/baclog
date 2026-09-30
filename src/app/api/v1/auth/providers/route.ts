import { withPublicApi } from "@/authz/api";
import { json } from "../../_lib/http";
import { appleSignInEnabled, googleIosClientId, googleWebClientId } from "../../_lib/social";
import type { AuthProviders } from "../../_lib/schemas";

/**
 * GET /api/v1/auth/providers (public) →
 *   { apple: boolean, google: { clientId: string | null, androidClientId: string | null } | null }
 * (phase 4f; `androidClientId` since 2026-09-30). Which social sign-in
 * buttons the app may paint — only the ones that work on this deploy.
 * `apple` is true unless the `AUTH_APPLE_DISABLED` kill-switch is set
 * (verifying an Apple identity token needs no key). `google.clientId` =
 * GOOGLE_IOS_CLIENT_ID (iOS `GIDConfiguration`; null → the iOS app paints no
 * Google button), `google.androidClientId` = GOOGLE_WEB_CLIENT_ID (the
 * `serverClientId` Android passes to `GetGoogleIdOption`; null → no button on
 * Android); `google` is null only when neither is set. Client ids are not
 * secrets (they ship inside every build). Rate limited by IP like the rest
 * of the public `auth/*`.
 */
export const GET = withPublicApi(async () => {
  const clientId = googleIosClientId();
  const androidClientId = googleWebClientId();
  const body: AuthProviders = {
    apple: appleSignInEnabled(),
    google: clientId || androidClientId ? { clientId, androidClientId } : null,
  };
  return json(body);
});

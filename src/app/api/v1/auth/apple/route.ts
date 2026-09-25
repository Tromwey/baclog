import { signInWithIdentity, storeAppleRefreshToken } from "@/auth/social";
import { verifyAppleIdentityToken } from "@/auth/social-tokens";
import { apiError, withPublicApi } from "@/authz/api";
import { afterResponse } from "@/lib/after-response";
import { json, readJson } from "../../_lib/http";
import { completeAppSignIn } from "../../_lib/sign-in";
import { appleSignInEnabled } from "../../_lib/social";
import { AppleSignInBodySchema } from "../../_lib/schemas";

const APPLE_401 = "No pudimos confirmar tu cuenta de Apple. Inténtalo de nuevo o entra con tu correo.";

/**
 * POST /api/v1/auth/apple { identityToken, rawNonce, authorizationCode?,
 * fullName?, device } → { token, user: Me } — the SAME response as
 * `otp/verify` (phase 4f).
 *
 * 1. `identityToken` verified against Apple's JWKS (`iss`, `aud` = the Kura
 *    bundle id, `exp`, and `nonce` = sha256hex(`rawNonce`)) —
 *    `verifyAppleIdentityToken`. Any failure → ONE 401 (never which).
 * 2. The Kura account: the `account(provider="apple", sub)` link, else the
 *    verified email (link or create — `signInWithIdentity`). No link and no
 *    verified email → the same 401.
 * 3. Minor → 403 `underage`; else a device session + bearer + `Me`
 *    (`completeAppSignIn`, shared with OTP and Google).
 * 4. `authorizationCode`, when sent, is exchanged for Apple's refresh token
 *    AFTER the response (best-effort, needs the APPLE_* key; without it the
 *    exchange is skipped with a log) — that token is what `DELETE /me`
 *    revokes (App Store 5.1.1(v)).
 *
 * `fullName` is accepted and IGNORED on purpose: writing `users.name` would
 * flip `Me.onboardingComplete` and skip the onboarding step that asks the
 * birth year (the F2.2 age gate). The app pre-fills the onboarding name
 * with it instead. 503 `unavailable` while the `AUTH_APPLE_DISABLED`
 * kill-switch is on. Public, rate limited by IP (`withPublicApi`).
 */
export const POST = withPublicApi(async (request) => {
  if (!appleSignInEnabled()) {
    return apiError("unavailable", "Apple no está disponible por ahora. Entra con tu correo.");
  }
  const body = await readJson(request, AppleSignInBodySchema);

  const identity = await verifyAppleIdentityToken(body.identityToken, body.rawNonce);
  if (!identity) return apiError("unauthorized", APPLE_401);

  const account = await signInWithIdentity("apple", identity);
  if (!account) return apiError("unauthorized", APPLE_401);

  const session = await completeAppSignIn(account, body.device, "apple");
  const code = body.authorizationCode;
  if (code) {
    afterResponse("auth/apple exchange", () => storeAppleRefreshToken(identity.sub, code));
  }
  return json(session);
});

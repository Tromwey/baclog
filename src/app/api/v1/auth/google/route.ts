import { signInWithIdentity } from "@/auth/social";
import { verifyGoogleIdToken } from "@/auth/social-tokens";
import { apiError, withPublicApi } from "@/authz/api";
import { json, readJson } from "../../_lib/http";
import { completeAppSignIn } from "../../_lib/sign-in";
import { googleIosClientId } from "../../_lib/social";
import { GoogleSignInBodySchema } from "../../_lib/schemas";

const GOOGLE_401 = "No pudimos confirmar tu cuenta de Google. Inténtalo de nuevo o entra con tu correo.";

/**
 * POST /api/v1/auth/google { idToken, device } → { token, user: Me } — the
 * SAME response as `otp/verify` (phase 4f).
 *
 * `idToken` verified against Google's JWKS (`iss` ∈ {https://accounts.google.com,
 * accounts.google.com}, `aud` = GOOGLE_IOS_CLIENT_ID, `exp`) with
 * `email_verified` true REQUIRED (`verifyGoogleIdToken`); then the
 * `account(provider="google", sub)` link or the verified email (link or
 * create), a minor → 403 `underage`, else session + bearer + `Me`. Any
 * token failure → ONE 401. Without GOOGLE_IOS_CLIENT_ID → 503 `unavailable`
 * (`auth/providers` already told the app not to paint the button). Public,
 * rate limited by IP.
 */
export const POST = withPublicApi(async (request) => {
  const clientId = googleIosClientId();
  if (!clientId) {
    return apiError("unavailable", "Google no está disponible por ahora.");
  }
  const body = await readJson(request, GoogleSignInBodySchema);

  const identity = await verifyGoogleIdToken(body.idToken, clientId);
  if (!identity) return apiError("unauthorized", GOOGLE_401);

  const account = await signInWithIdentity("google", identity);
  if (!account) return apiError("unauthorized", GOOGLE_401);

  return json(await completeAppSignIn(account, body.device, "google"));
});

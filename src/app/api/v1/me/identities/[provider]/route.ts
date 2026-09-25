import {
  appleIsLastWayIn,
  linkIdentity,
  storeAppleRefreshToken,
  unlinkProvider,
  type LinkOutcome,
} from "@/auth/social";
import { verifyAppleIdentityToken, verifyGoogleIdToken } from "@/auth/social-tokens";
import { ApiError, withApi } from "@/authz/api";
import { afterResponse } from "@/lib/after-response";
import { json, noContent, readJson } from "../../../_lib/http";
import { invalidProof, mergeProofFor } from "../../../_lib/merge";
import {
  APPLE_UNAVAILABLE,
  GOOGLE_UNAVAILABLE,
  appleSignInEnabled,
  googleIosClientId,
} from "../../../_lib/social";
import {
  AppleLinkBodySchema,
  GoogleLinkBodySchema,
  type IdentityLinked,
} from "../../../_lib/schemas";

type Params = { provider: string };

/** One copy per provider for every rejected token (no oracle). */
const APPLE_PROOF_MESSAGE = "No pudimos confirmar tu cuenta de Apple. Inténtalo de nuevo.";
const GOOGLE_PROOF_MESSAGE = "No pudimos confirmar tu cuenta de Google. Inténtalo de nuevo.";

const LAST_WAY_IN_MESSAGE =
  "Tu correo es de «Ocultar mi correo» de Apple: si desconectas Apple, puede que no te lleguen los códigos. Conecta Google antes de desconectar Apple.";

const LINKED_ELSEWHERE_MESSAGE =
  "Esa cuenta ya está unida a otra cuenta de Kura. Si también es tuya, puedes fusionarlas.";
const ALREADY_LINKED_MESSAGE =
  "Esta cuenta ya tiene otra cuenta de ese proveedor conectada. Desconéctala primero.";

/** Unknown provider in the path = the plain 404 (never a 400: a validation
 *  error in the path would say which strings are worth probing). */
function providerOf(raw: string): "apple" | "google" {
  if (raw === "apple" || raw === "google") return raw;
  throw new ApiError("not_found");
}

async function answer(userId: string, outcome: LinkOutcome): Promise<Response> {
  switch (outcome.kind) {
    case "linked": {
      const body: IdentityLinked = { linked: true };
      return json(body);
    }
    case "elsewhere": {
      // The provider token just proved ownership of that other account:
      // the proof rides inside the error envelope (`mergeToken`, `source`).
      const proof = await mergeProofFor(userId, outcome.ownerId);
      throw new ApiError("conflict", LINKED_ELSEWHERE_MESSAGE, {
        reason: "linked_elsewhere",
        mergeToken: proof.mergeToken,
        source: proof.source,
      });
    }
    case "provider_already_linked":
      throw new ApiError("conflict", ALREADY_LINKED_MESSAGE, { reason: "provider_already_linked" });
    default: {
      const unhandled: never = outcome;
      throw new Error(`identities: unhandled outcome ${JSON.stringify(unhandled)}`);
    }
  }
}

/**
 * POST /api/v1/me/identities/{apple|google} (phase 4g) — connect a provider
 * to the SIGNED-IN account (the bearer's; never a body field).
 *   apple  { identityToken, rawNonce, authorizationCode? }
 *   google { idToken }
 * Verified exactly like the sign-in (`social-tokens.ts`); a rejected token
 * (any cause) is ONE 422 `invalid` + reason `invalid_proof` — never 401,
 * which the app reads as "session dead". Then (`linkIdentity`):
 *   200 { linked: true }  — linked now, or already this account's (idempotent)
 *   409 linked_elsewhere  — the identity (by link, or by its verified email)
 *                           is ANOTHER Kura account: `mergeToken` + `source`
 *                           inside the error
 *   409 provider_already_linked — this account has another id of the provider
 *   503 unavailable       — provider switched off on this deploy
 * Apple's `authorizationCode` is exchanged for the refresh token AFTER the
 * response (as on sign-in) — the token `DELETE /me` and unlinking revoke.
 */
export const POST = withApi<Params>(async (request, { user, params }) => {
  const provider = providerOf(params.provider);

  if (provider === "apple") {
    if (!appleSignInEnabled()) throw new ApiError("unavailable", APPLE_UNAVAILABLE);
    const body = await readJson(request, AppleLinkBodySchema);
    const identity = await verifyAppleIdentityToken(body.identityToken, body.rawNonce);
    if (!identity) throw invalidProof(APPLE_PROOF_MESSAGE);
    const outcome = await linkIdentity(user.id, "apple", identity);
    const code = body.authorizationCode;
    if (code && outcome.kind !== "provider_already_linked") {
      // Keyed by the Apple `sub`: it lands on whichever account row holds
      // that link (this one, or the one a merge will move here).
      afterResponse("auth/apple exchange", () => storeAppleRefreshToken(identity.sub, code));
    }
    return answer(user.id, outcome);
  }

  const clientId = googleIosClientId();
  if (!clientId) throw new ApiError("unavailable", GOOGLE_UNAVAILABLE);
  const body = await readJson(request, GoogleLinkBodySchema);
  const identity = await verifyGoogleIdToken(body.idToken, clientId);
  if (!identity) throw invalidProof(GOOGLE_PROOF_MESSAGE);
  return answer(user.id, await linkIdentity(user.id, "google", identity));
});

/**
 * DELETE /api/v1/me/identities/{apple|google} → 204 (idempotent). Drops the
 * caller's links to that provider. Apple: its refresh token is revoked after
 * the response (best-effort, App Store 5.1.1(v)). Allowed — the account's
 * email stays a way in — EXCEPT Apple when that email is an Apple private
 * relay and no other provider is linked: revoking Apple may stop the relay
 * forwarding the login code, locking the account out → 409 `last_way_in`,
 * nothing touched. Unknown provider → 404.
 */
export const DELETE = withApi<Params>(async (_request, { user, params }) => {
  const provider = providerOf(params.provider);
  if (provider === "apple" && (await appleIsLastWayIn(user.id, user.email))) {
    throw new ApiError("conflict", LAST_WAY_IN_MESSAGE, { reason: "last_way_in" });
  }
  const revoke = await unlinkProvider(user.id, provider);
  afterResponse("auth/apple revoke", revoke);
  return noContent();
});

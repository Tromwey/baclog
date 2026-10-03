import { issueOtp, OtpCooldownError } from "@/auth/otp";
import { apiError, clientIp, withPublicApi } from "@/authz/api";
import { noContent, readJson } from "../../../_lib/http";
import { OtpRequestBodySchema } from "../../../_lib/schemas";
import { waitLabel } from "@/lib/wait-label";

/**
 * POST /api/v1/auth/otp/request { email } → 204 (§2.1 step 1).
 * Same `issueOtp` as the web. 204 whether or not the account exists: the OTP
 * flow creates the account on verify, so there is nothing to enumerate.
 *
 * 429 `rate_limited` + `reason` + `retryAfterSeconds` (the real wait) +
 * `Retry-After`:
 *   - `cooldown`   — a code was sent to this caller < 60 s ago and is still
 *                    usable: "revisa tu correo" (the ONLY reason that may
 *                    claim a code is waiting);
 *   - `hourly_cap` — a cap (5/h for this caller's network, 15/h for the
 *                    address across everyone), or a cooldown with no usable
 *                    code (mail failed, attempts burned): no code promised;
 *   - `ip_limit`   — the per-IP limiter of `withPublicApi`: nothing was sent
 *                    (its own copy, A6 of copy-unificado.md; the bucket is
 *                    still the shared `ip:` one of `auth/*`).
 */
const MESSAGES = {
  cooldown: (wait: string) =>
    `Ya te enviamos un código hace poco y sigue siendo válido. Revisa tu correo o espera ${wait} para pedir otro.`,
  hourly_cap: (wait: string) =>
    `Se pidieron demasiados códigos para este correo. Podrás pedir otro en ${wait}.`,
} as const;

/** A6 — the canonical line for "this network asked too much". */
const IP_LIMIT_MESSAGE = (retryAfterSeconds: number) =>
  `Demasiados intentos desde esta red. Podrás pedir un código en ${waitLabel(retryAfterSeconds)}.`;

export const POST = withPublicApi(async (request) => {
  const { email } = await readJson(request, OtpRequestBodySchema);
  try {
    await issueOtp(email, clientIp(request));
  } catch (err) {
    if (err instanceof OtpCooldownError) {
      return apiError("rate_limited", MESSAGES[err.reason](waitLabel(err.retryAfterSeconds)), {
        reason: err.reason,
        retryAfterSeconds: err.retryAfterSeconds,
      });
    }
    throw err;
  }
  return noContent();
}, { limitMessage: IP_LIMIT_MESSAGE });

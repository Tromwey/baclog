import { issueMergeOtp, MergeOtpCapError, OtpCooldownError } from "@/auth/otp";
import { ApiError, withApi } from "@/authz/api";
import { afterResponse } from "@/lib/after-response";
import { noContent, readJson } from "../../../../_lib/http";
import { MergeOtpRequestBodySchema } from "../../../../_lib/schemas";

const COOLDOWN_SECONDS = 60;

/**
 * POST /api/v1/me/merge/otp/request { email } → 204 ALWAYS (phase 4g) —
 * whether or not a Kura account has that email, and whether it is the
 * caller's own. Only a real OTHER account gets a code, mailed AFTER the
 * response (`issueMergeOtp`: the decoy path writes the same row, so the
 * 60 s cooldown — 429 `rate_limited` — and the timing are identical).
 * The code is stored as `merge:<callerId>:<email>`: never a login code, and
 * only this caller can redeem it. Rate limit: the bearer's write limit plus
 * the DB cooldown per (caller, email), the login OTP's posture, PLUS a cap
 * of 3 codes an hour per TARGET email across every asking account (429 with
 * `retryAfterSeconds` until the oldest of those rows ages out) — so several
 * attacker accounts can't multiply the 5 guesses a code allows. Decoy rows
 * count the same: the 429 says nothing about whether the account exists.
 */
export const POST = withApi(async (request, { user }) => {
  const { email } = await readJson(request, MergeOtpRequestBodySchema);
  let send: (() => Promise<void>) | null;
  try {
    ({ send } = await issueMergeOtp(user.id, email));
  } catch (err) {
    if (err instanceof OtpCooldownError) {
      throw new ApiError(
        "rate_limited",
        "Ya te enviamos un código hace poco. Revisa tu correo o espera un minuto para pedir otro.",
        { retryAfterSeconds: COOLDOWN_SECONDS },
      );
    }
    if (err instanceof MergeOtpCapError) {
      throw new ApiError(
        "rate_limited",
        "Ya se pidieron varios códigos para ese correo. Espera un rato antes de pedir otro.",
        { retryAfterSeconds: err.retryAfterSeconds },
      );
    }
    throw err;
  }
  if (send) afterResponse("account/merge otp mail", send);
  return noContent();
});

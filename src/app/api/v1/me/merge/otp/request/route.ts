import { issueMergeOtp, MergeOtpCapError, OtpCooldownError } from "@/auth/otp";
import { ApiError, withApi } from "@/authz/api";
import { afterResponse } from "@/lib/after-response";
import { noContent, readJson } from "../../../../_lib/http";
import { MergeOtpRequestBodySchema } from "../../../../_lib/schemas";
import { waitLabel } from "@/lib/wait-label";

/**
 * POST /api/v1/me/merge/otp/request { email } → 204 ALWAYS (phase 4g) —
 * whether or not a Kura account has that email, and whether it is the
 * caller's own. Only a real OTHER account gets a code, mailed AFTER the
 * response (`issueMergeOtp`: the decoy path writes the same row, so the
 * limits and the timing are identical). The code is stored as
 * `merge:<callerId>:<email>`: never a login code, and only this caller can
 * redeem it.
 *
 * 429 `rate_limited` + `reason` + `retryAfterSeconds` (the real wait) +
 * `Retry-After` — the same names as `POST /auth/otp/request`:
 *   - `cooldown`   — this account asked for a code for this email less than
 *                    60 s ago ("revisa tu correo");
 *   - `hourly_cap` — 3 codes an hour per TARGET email across every asking
 *                    account (so several attacker accounts can't multiply
 *                    the 5 guesses a code allows) — or a wait with NO code
 *                    to look for: the mail of the last one was refused and
 *                    the code withdrawn (`issueMergeOtp`), so the message
 *                    only says to wait.
 * Both are decided on rows that exist whether or not the account does (decoy
 * rows count the same), so neither says anything about the address. A 429
 * WITHOUT `reason` is the bearer's own write limiter (`withApi`).
 */
export const POST = withApi(async (request, { user }) => {
  const { email } = await readJson(request, MergeOtpRequestBodySchema);
  let send: (() => Promise<void>) | null;
  try {
    ({ send } = await issueMergeOtp(user.id, email));
  } catch (err) {
    if (err instanceof OtpCooldownError) {
      // Only `cooldown` may say a code is waiting (same rule as the login).
      throw new ApiError(
        "rate_limited",
        err.reason === "cooldown"
          ? `Ya enviamos un código a ese correo hace poco y sigue siendo válido. Revísalo o espera ${waitLabel(err.retryAfterSeconds)} para pedir otro.`
          : `Se pidieron demasiados códigos para ese correo. Podrás pedir otro en ${waitLabel(err.retryAfterSeconds)}.`,
        { reason: err.reason, retryAfterSeconds: err.retryAfterSeconds },
      );
    }
    if (err instanceof MergeOtpCapError) {
      throw new ApiError(
        "rate_limited",
        `Se pidieron demasiados códigos para ese correo. Podrás pedir otro en ${waitLabel(err.retryAfterSeconds)}.`,
        { reason: "hourly_cap", retryAfterSeconds: err.retryAfterSeconds },
      );
    }
    throw err;
  }
  if (send) afterResponse("account/merge otp mail", send);
  return noContent();
});

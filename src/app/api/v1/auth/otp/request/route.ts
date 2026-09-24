import { issueOtp, OtpCooldownError } from "@/auth/otp";
import { apiError, withPublicApi } from "@/authz/api";
import { noContent, readJson } from "../../../_lib/http";
import { OtpRequestBodySchema } from "../../../_lib/schemas";

/**
 * POST /api/v1/auth/otp/request { email } → 204 (§2.1 step 1).
 * Same `issueOtp` as the web (one live code per email, 60 s cooldown in the
 * DB). 204 whether or not the account exists: the OTP flow creates the
 * account on verify, so there is nothing to enumerate.
 */
const COOLDOWN_SECONDS = 60;

export const POST = withPublicApi(async (request) => {
  const { email } = await readJson(request, OtpRequestBodySchema);
  try {
    await issueOtp(email);
  } catch (err) {
    if (err instanceof OtpCooldownError) {
      return apiError(
        "rate_limited",
        "Ya te enviamos un código hace poco. Revisa tu correo o espera un minuto para pedir otro.",
        { retryAfterSeconds: COOLDOWN_SECONDS },
      );
    }
    throw err;
  }
  return noContent();
});

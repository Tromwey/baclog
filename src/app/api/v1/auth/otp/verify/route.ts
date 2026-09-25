import { verifyOtp } from "@/auth/otp";
import { apiError, withPublicApi } from "@/authz/api";
import { json, readJson } from "../../../_lib/http";
import { completeAppSignIn } from "../../../_lib/sign-in";
import { OtpVerifyBodySchema } from "../../../_lib/schemas";

/**
 * POST /api/v1/auth/otp/verify { email, code, device } → { token, user: Me }
 * (§2.1 step 2). Same `verifyOtp` as the web: finds-or-creates the account,
 * burns attempts on a miss, kills the code after 5. A wrong/expired code is
 * ONE 401 (never which). Since phase 4d `device` becomes this install's
 * `mobile_session` row and the bearer carries its id as `sid`
 * (`completeAppSignIn`, shared with Apple/Google).
 */
export const POST = withPublicApi(async (request) => {
  const { email, code, device } = await readJson(request, OtpVerifyBodySchema);

  const account = await verifyOtp(email, code);
  if (!account) {
    return apiError(
      "unauthorized",
      "El código no es válido o ya venció. Pide uno nuevo.",
    );
  }
  return json(await completeAppSignIn(account, device, "otp"));
});

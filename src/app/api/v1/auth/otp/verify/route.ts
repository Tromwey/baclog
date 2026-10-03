import { OtpLockedError, verifyOtp } from "@/auth/otp";
import { apiError, clientIp, withPublicApi } from "@/authz/api";
import { json, readJson } from "../../../_lib/http";
import { completeAppSignIn } from "../../../_lib/sign-in";
import { OtpVerifyBodySchema } from "../../../_lib/schemas";

/**
 * POST /api/v1/auth/otp/verify { email, code, device } → { token, user: Me }
 * (§2.1 step 2). Same `verifyOtp` as the web: finds-or-creates the account,
 * a miss from the network that asked for the code burns one of its 5 attempts
 * (a guess from elsewhere draws on the address's 10 foreign guesses an hour
 * and never burns them — `src/auth/otp.ts`). A wrong/expired code is
 * ONE 401 (never which); a code that no retyping can fix — its attempts are
 * spent, or a guess budget is — is the same 401 with `reason: "locked"` and
 * its own message (ronda 4), so the app can stop saying "revisa el código".
 * The message asks to WAIT, like the web's (ronda 5): `locked` covers three
 * causes and in two of them (the address's foreign budget, the demo
 * account's guess budget) a new code asked right away is refused the same. Still a 401 on purpose: builds that don't know the
 * reason keep doing what they did. Not an existence oracle — the limits are
 * per (email, network), whether or not an account has the address. Since phase 4d `device` becomes this install's
 * `mobile_session` row and the bearer carries its id as `sid`
 * (`completeAppSignIn`, shared with Apple/Google).
 */
export const POST = withPublicApi(async (request) => {
  const { email, code, device } = await readJson(request, OtpVerifyBodySchema);

  let account: Awaited<ReturnType<typeof verifyOtp>>;
  try {
    account = await verifyOtp(email, code, clientIp(request));
  } catch (err) {
    if (!(err instanceof OtpLockedError)) throw err;
    return apiError("unauthorized", "Se intentó demasiadas veces. Pide otro código más tarde.", {
      reason: "locked",
    });
  }
  if (!account) {
    return apiError(
      "unauthorized",
      "El código es incorrecto o ya venció. Revísalo o pide otro.",
    );
  }
  return json(await completeAppSignIn(account, device, "otp"));
});

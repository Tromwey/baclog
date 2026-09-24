import { loadUserWithTokenVersion } from "@/auth/user-row";
import { verifyOtp } from "@/auth/otp";
import { apiError, issueMobileToken, withPublicApi } from "@/authz/api";
import { json, readJson } from "../../../_lib/http";
import { buildMe } from "../../../_lib/me";
import { OtpVerifyBodySchema, type AuthSession } from "../../../_lib/schemas";

/**
 * POST /api/v1/auth/otp/verify { email, code, device } → { token, user: Me }
 * (§2.1 step 2). Same `verifyOtp` as the web: finds-or-creates the account,
 * burns attempts on a miss, kills the code after 5. A wrong/expired code is
 * ONE 401 (never which). `device` is validated and logged only — there is no
 * device table yet (phase 4).
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
  if (account.isMinor) {
    return apiError(
      "forbidden",
      "Kura es para mayores de 13 años. Esta cuenta no puede entrar.",
      { reason: "underage" },
    );
  }

  // Re-read through the one user loader (explicit field list, no birthYear)
  // so the `Me` here is byte-for-byte what `GET /me` will return — plus the
  // account's current `token_version`, which the new bearer carries as `tv`
  // (a later `auth/logout` bumps it and this token dies with the rest).
  const row = await loadUserWithTokenVersion(account.id);
  if (!row) return apiError("unauthorized");
  const { user, tokenVersion } = row;

  const token = await issueMobileToken(user.id, tokenVersion);
  // Structured, and WITHOUT `device.name`: it is free text the client chose
  // (PII — people name their phone after themselves — and a log-injection
  // vector). Platform + version are enum/short-validated.
  console.log(
    `[api/v1] sign-in ${JSON.stringify({
      platform: device.platform,
      appVersion: device.appVersion,
      userId: user.id,
    })}`,
  );
  const body: AuthSession = { token, user: await buildMe(user) };
  return json(body);
});

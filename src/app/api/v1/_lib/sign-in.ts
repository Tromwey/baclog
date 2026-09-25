import "server-only";
import { createMobileSession } from "@/auth/mobile-sessions";
import { loadUserWithTokenVersion } from "@/auth/user-row";
import { ApiError, issueMobileToken } from "@/authz/api";
import { buildMe } from "./me";
import type { AuthSession, Device } from "./schemas";

/** The one message of a minor's refused sign-in (OTP, Apple, Google). */
export const UNDERAGE_MESSAGE = "Kura es para mayores de 13 años. Esta cuenta no puede entrar.";

/**
 * The shared tail of every app sign-in (`auth/otp/verify`, `auth/apple`,
 * `auth/google`) once the credential proved WHO this is: a minor is the
 * 403 `underage`; otherwise a `mobile_session` row for this install
 * (phase 4d — null while migration 0029 isn't live, then the bearer is a
 * legacy one without `sid`), a bearer at the account's current
 * `token_version`, and the `Me` that `GET /me` will return next.
 *
 * The user is re-read through the one loader (explicit field list, never
 * `birthYear`). The log line is structured and WITHOUT `device.name` — free
 * text the client chose (PII: people name their phone after themselves, and
 * a log-injection vector); platform and version are short-validated.
 */
export async function completeAppSignIn(
  account: { id: string; isMinor: boolean },
  device: Device,
  method: "otp" | "apple" | "google",
): Promise<AuthSession> {
  if (account.isMinor) {
    throw new ApiError("forbidden", UNDERAGE_MESSAGE, { reason: "underage" });
  }
  const row = await loadUserWithTokenVersion(account.id);
  if (!row) throw new ApiError("unauthorized");
  const { user, tokenVersion } = row;

  const sessionId = await createMobileSession(user.id, device);
  const token = await issueMobileToken(user.id, tokenVersion, sessionId);
  console.log(
    `[api/v1] sign-in ${JSON.stringify({
      method,
      platform: device.platform,
      appVersion: device.appVersion,
      userId: user.id,
      sessionId,
    })}`,
  );
  return { token, user: await buildMe(user) };
}

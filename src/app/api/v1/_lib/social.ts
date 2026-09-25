import "server-only";
import { env } from "@/lib/env";

/** Kill-switch for Sign in with Apple (`AUTH_APPLE_DISABLED=1|true`). */
export function appleSignInEnabled(): boolean {
  const v = env.AUTH_APPLE_DISABLED?.trim().toLowerCase();
  return !(v === "1" || v === "true" || v === "yes");
}

/** The Google iOS OAuth client id, or null when Google is off. */
export function googleIosClientId(): string | null {
  return env.GOOGLE_IOS_CLIENT_ID?.trim() || null;
}

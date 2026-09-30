import "server-only";
import { env } from "@/lib/env";

/** Kill-switch for Sign in with Apple (`AUTH_APPLE_DISABLED=1|true`). */
export function appleSignInEnabled(): boolean {
  const v = env.AUTH_APPLE_DISABLED?.trim().toLowerCase();
  return !(v === "1" || v === "true" || v === "yes");
}

/** The Google iOS OAuth client id (`GIDConfiguration`), or null. */
export function googleIosClientId(): string | null {
  return env.GOOGLE_IOS_CLIENT_ID?.trim() || null;
}

/** The Google "Web application" OAuth client id, or null. Android's
 *  Credential Manager passes it as `serverClientId`, so the ID tokens the
 *  Android app gets carry `aud` = this id (and `azp` = the Android client). */
export function googleWebClientId(): string | null {
  return env.GOOGLE_WEB_CLIENT_ID?.trim() || null;
}

/**
 * Every `aud` a Google ID token may carry on this deploy: the iOS client id
 * and the web client id (Android), whichever are set. Empty = Google is off
 * (`auth/google` and linking answer 503, `auth/providers` says `google: null`,
 * `GET /me/identities` omits it). One list for sign-in AND linking, so a
 * phone can never sign in with a token it could not link, or vice versa.
 */
export function googleAudiences(): string[] {
  return [...new Set([googleIosClientId(), googleWebClientId()].filter((c): c is string => !!c))];
}

/** The ONE 401 copy for a rejected Apple / Google token — sign-in
 *  (`auth/{apple,google}`) and linking (`me/identities/{provider}`) alike. */
export const APPLE_401 = "No pudimos confirmar tu cuenta de Apple. Inténtalo de nuevo o entra con tu correo.";
export const GOOGLE_401 = "No pudimos confirmar tu cuenta de Google. Inténtalo de nuevo o entra con tu correo.";
export const APPLE_UNAVAILABLE = "Apple no está disponible por ahora. Entra con tu correo.";
export const GOOGLE_UNAVAILABLE = "Google no está disponible por ahora.";

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

/** The ONE 401 copy for a rejected Apple / Google token — sign-in
 *  (`auth/{apple,google}`) and linking (`me/identities/{provider}`) alike. */
export const APPLE_401 = "No pudimos confirmar tu cuenta de Apple. Inténtalo de nuevo o entra con tu correo.";
export const GOOGLE_401 = "No pudimos confirmar tu cuenta de Google. Inténtalo de nuevo o entra con tu correo.";
export const APPLE_UNAVAILABLE = "Apple no está disponible por ahora. Entra con tu correo.";
export const GOOGLE_UNAVAILABLE = "Google no está disponible por ahora.";

import "server-only";
import { env } from "@/lib/env";
import { appleKeyConfig, signAppleClientSecret } from "./apple-key";

/**
 * Sign in with Apple on the WEB (2026-09-29) — the OAuth/OIDC redirect flow
 * through Auth.js's `Apple` provider (src/auth/config.ts), next to the OTP
 * form on /login. The iOS app keeps its own path (`POST /api/v1/auth/apple`,
 * phase 4f); both end in the same `account(provider="apple", sub)` row and
 * the same `signInWithIdentity` decision (src/auth/social.ts), so a person
 * who signed up with Apple on the phone lands in the same Kura account here.
 *
 * Apple side (founder, developer.apple.com › Identifiers):
 *   - a Services ID (`APPLE_WEB_CLIENT_ID`, e.g. `com.tromwey.kura.web`) with
 *     Sign in with Apple enabled, primary App ID = `com.tromwey.kura`,
 *     domains `get-kura.app` + `beta.get-kura.app`, return URLs
 *     `https://get-kura.app/api/auth/callback/apple` and the beta one;
 *   - the SAME .p8 key as APNs / the app (APPLE_TEAM_ID/KEY_ID/PRIVATE_KEY)
 *     signs the web `client_secret` with `sub` = the Services ID.
 * Apple's `sub` for a person is per TEAM (the grouped app id and Services ID
 * see the same one), which is what makes the account row shared.
 *
 * Off (no button, no provider) unless the kill-switch is off AND the Services
 * ID AND the key are configured: without the key no `client_secret` can be
 * minted, so the button would only lead to an error page.
 */

/** The web Services ID, or null. */
export function appleWebClientId(): string | null {
  return env.APPLE_WEB_CLIENT_ID?.trim() || null;
}

function killSwitchOn(): boolean {
  const v = env.AUTH_APPLE_DISABLED?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function appleWebSignInEnabled(): boolean {
  return !killSwitchOn() && appleWebClientId() !== null && appleKeyConfig() !== null;
}

/**
 * The web `client_secret`: an ES256 JWT Auth.js posts to Apple's token
 * endpoint. Auth.js reads the provider config on EVERY request (the config is
 * a function so the secret can be async), so it is minted once and reused
 * for 12 h with a 24 h expiry — never stored, never logged.
 */
const SECRET_TTL_S = 24 * 60 * 60;
const SECRET_REUSE_MS = 12 * 60 * 60 * 1000;
let cached: { clientId: string; keyPem: string; value: string; mintedAt: number } | null = null;

export async function appleWebClientSecret(): Promise<string | null> {
  const clientId = appleWebClientId();
  const cfg = appleKeyConfig();
  if (!clientId || !cfg) return null;
  const now = Date.now();
  if (
    cached &&
    cached.clientId === clientId &&
    cached.keyPem === cfg.privateKeyPem &&
    now - cached.mintedAt < SECRET_REUSE_MS
  ) {
    return cached.value;
  }
  const value = await signAppleClientSecret(cfg, Math.floor(now / 1000), clientId, SECRET_TTL_S);
  cached = { clientId, keyPem: cfg.privateKeyPem, value, mintedAt: now };
  return value;
}

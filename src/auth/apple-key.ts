import { SignJWT, importPKCS8 } from "jose";

/**
 * The ONE Apple private key (.p8) of the Kura developer account, used for
 * two things (Apple allows one key with both services enabled):
 *   - APNs provider tokens (`modules/push/apns.ts`): ES256 JWT, `kid` =
 *     APPLE_KEY_ID, `iss` = APPLE_TEAM_ID, `iat`.
 *   - Sign in with Apple `client_secret` (`src/auth/social.ts`): ES256 JWT,
 *     `iss` = team, `sub` = the bundle id, `aud` = https://appleid.apple.com,
 *     short `exp`.
 *
 * Env: APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY (the .p8 CONTENT —
 * PEM with real newlines, `\n` escaped as Vercel often stores it, or even
 * the bare base64 body). Any of the three missing = not configured: callers
 * degrade (push = logged no-op; Apple login still works, the code exchange
 * for revocation is skipped with a log). Never logs the key.
 *
 * No `server-only`: pure crypto, exercised by scratch test scripts. Reading
 * `process.env` happens only through `appleKeyConfig(env)`.
 */

export const KURA_BUNDLE_ID = "com.tromwey.kura";
export const APPLE_ID_AUDIENCE = "https://appleid.apple.com";

export interface AppleKeyConfig {
  teamId: string;
  keyId: string;
  /** Normalized PKCS#8 PEM. */
  privateKeyPem: string;
}

/**
 * The .p8 as a PEM whatever way it was pasted: surrounding quotes dropped,
 * literal `\n` (and `\r\n`) turned into newlines, and a bare base64 body
 * (headers stripped by a UI) wrapped back into BEGIN/END PRIVATE KEY lines.
 * Null when there is nothing key-shaped in it.
 */
export function normalizeP8(raw: string): string | null {
  let s = raw.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  s = s.replace(/\\r\\n|\\n|\\r/g, "\n").replace(/\r\n?/g, "\n");
  const body = s
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----/g, "")
    .replace(/-----END [A-Z ]*PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  if (!body || !/^[A-Za-z0-9+/]+=*$/.test(body)) return null;
  const lines = body.match(/.{1,64}/g) ?? [];
  return `-----BEGIN PRIVATE KEY-----\n${lines.join("\n")}\n-----END PRIVATE KEY-----\n`;
}

/** Null unless all three vars are present and the key is key-shaped. */
export function appleKeyConfig(
  env: Record<string, string | undefined> = process.env,
): AppleKeyConfig | null {
  const teamId = env.APPLE_TEAM_ID?.trim();
  const keyId = env.APPLE_KEY_ID?.trim();
  const raw = env.APPLE_PRIVATE_KEY;
  if (!teamId || !keyId || !raw) return null;
  const privateKeyPem = normalizeP8(raw);
  if (!privateKeyPem) return null;
  return { teamId, keyId, privateKeyPem };
}

// One import per PEM (importPKCS8 is not free; the PEM only changes on a
// redeploy with a new env).
let imported: { pem: string; key: Promise<CryptoKey> } | null = null;

function signingKey(cfg: AppleKeyConfig): Promise<CryptoKey> {
  if (!imported || imported.pem !== cfg.privateKeyPem) {
    const key = importPKCS8(cfg.privateKeyPem, "ES256");
    imported = { pem: cfg.privateKeyPem, key };
    // A bad key must not stay cached as a rejected promise forever.
    key.catch(() => {
      if (imported?.key === key) imported = null;
    });
  }
  return imported.key;
}

/** APNs provider token (valid ≤ 60 min at Apple; callers cache ~50). */
export async function signApnsProviderToken(
  cfg: AppleKeyConfig,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: cfg.keyId })
    .setIssuer(cfg.teamId)
    .setIssuedAt(nowSeconds)
    .sign(await signingKey(cfg));
}

/** Sign in with Apple `client_secret` for /auth/token and /auth/revoke.
 *  5 minutes: it is minted per call, never stored. */
export async function signAppleClientSecret(
  cfg: AppleKeyConfig,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: cfg.keyId })
    .setIssuer(cfg.teamId)
    .setSubject(KURA_BUNDLE_ID)
    .setAudience(APPLE_ID_AUDIENCE)
    .setIssuedAt(nowSeconds)
    .setExpirationTime(nowSeconds + 300)
    .sign(await signingKey(cfg));
}

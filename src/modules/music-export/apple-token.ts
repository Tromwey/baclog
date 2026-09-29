import { SignJWT, importPKCS8 } from "jose";
import { APPLE_DEVELOPER_TOKEN_TTL_SECONDS, type AppleMusicKeyConfig } from "./config";

/**
 * The MusicKit developer token: ES256 JWT, header `kid` = a key with
 * MusicKit enabled, claims `iss` = team id, `iat`, `exp` (Apple allows ≤ 6
 * months; we mint 12 h). No `origin` claim: the same token serves the
 * server-side catalog calls, which send no Origin header.
 * Pure (jose only, no `server-only`) so `scripts/check-music-export.ts`
 * verifies it with a throwaway key. Server code only.
 */

let keyCache: { pem: string; key: Promise<CryptoKey> } | null = null;

function signingKey(cfg: AppleMusicKeyConfig): Promise<CryptoKey> {
  if (!keyCache || keyCache.pem !== cfg.privateKeyPem) {
    const key = importPKCS8(cfg.privateKeyPem, "ES256");
    keyCache = { pem: cfg.privateKeyPem, key };
    // A bad key must not stay cached as a rejected promise forever.
    key.catch(() => {
      if (keyCache?.key === key) keyCache = null;
    });
  }
  return keyCache.key;
}

export async function signAppleMusicDeveloperToken(
  cfg: AppleMusicKeyConfig,
  nowSeconds = Math.floor(Date.now() / 1000),
  ttlSeconds = APPLE_DEVELOPER_TOKEN_TTL_SECONDS,
): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: cfg.keyId })
    .setIssuer(cfg.teamId)
    .setIssuedAt(nowSeconds)
    .setExpirationTime(nowSeconds + ttlSeconds)
    .sign(await signingKey(cfg));
}

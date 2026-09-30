import { SignJWT, importPKCS8 } from "jose";
import { APPLE_DEVELOPER_TOKEN_TTL_SECONDS, type AppleMusicKeyConfig } from "./config";

/**
 * The MusicKit developer token: ES256 JWT, header `kid` = the dedicated
 * MusicKit key, claims `iss` = team id, `iat`, `exp` (Apple allows ≤ 6
 * months). Two flavours (apple-music.ts): the SERVER's (12 h, no `origin`,
 * never leaves the server — catalog ISRC calls send no Origin header) and the
 * BROWSER's (1 h, `origin` = our web origins, so Apple refuses it elsewhere).
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
  origins?: readonly string[],
): Promise<string> {
  return new SignJWT(origins && origins.length > 0 ? { origin: [...origins] } : {})
    .setProtectedHeader({ alg: "ES256", kid: cfg.keyId })
    .setIssuer(cfg.teamId)
    .setIssuedAt(nowSeconds)
    .setExpirationTime(nowSeconds + ttlSeconds)
    .sign(await signingKey(cfg));
}

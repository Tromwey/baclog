import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * Encryption at rest for third-party credentials (music export: TIDAL
 * access/refresh tokens, the PKCE verifier and the parked authorization code).
 *
 * AES-256-GCM. The key is derived with HKDF-SHA256 from `MUSIC_TOKEN_KEY`
 * when set, else from `AUTH_SECRET` (one less secret to manage; setting
 * `MUSIC_TOKEN_KEY` later makes every stored token unreadable → the user
 * reconnects, nothing else breaks). `purpose` separates key spaces, and the
 * AAD binds each ciphertext to WHERE it lives (user + provider + field), so
 * a value copied into another row or column fails to open instead of being
 * used as someone else's token.
 *
 * Format: `v1.<iv b64url>.<ciphertext b64url>.<tag b64url>` (12-byte IV,
 * 16-byte tag). `openSecret` returns null on ANY failure (wrong key, tampered,
 * wrong AAD, malformed) and never logs the value.
 *
 * No `server-only`: pure `node:crypto`, exercised by `scripts/check-music-export.ts`.
 * Never import it from a client component.
 */

const VERSION = "v1";

function keyFor(purpose: string, env: Record<string, string | undefined>): Buffer {
  const secret = env.MUSIC_TOKEN_KEY?.trim() || env.AUTH_SECRET;
  if (!secret) throw new Error("secret-box: neither MUSIC_TOKEN_KEY nor AUTH_SECRET is set");
  return Buffer.from(hkdfSync("sha256", secret, "kura:secret-box", `kura:${purpose}:${VERSION}`, 32));
}

export function sealSecret(
  plaintext: string,
  purpose: string,
  aad: string,
  env: Record<string, string | undefined> = process.env,
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor(purpose, env), iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), ct.toString("base64url"), tag.toString("base64url")].join(".");
}

export function openSecret(
  sealed: string | null | undefined,
  purpose: string,
  aad: string,
  env: Record<string, string | undefined> = process.env,
): string | null {
  if (typeof sealed !== "string") return null;
  const parts = sealed.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) return null;
  try {
    const iv = Buffer.from(parts[1], "base64url");
    const ct = Buffer.from(parts[2], "base64url");
    const tag = Buffer.from(parts[3], "base64url");
    if (iv.length !== 12 || tag.length !== 16) return null;
    const decipher = createDecipheriv("aes-256-gcm", keyFor(purpose, env), iv);
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

import "server-only";
import { env } from "@/lib/env";

/**
 * The HS256 key for every JWS this app mints itself — the iOS bearer
 * (`aud = "kura-ios"`, `api.ts`) and the one-shot web handoff
 * (`aud = "kura-web-handoff"`, `handoff.ts`). Both are signed with
 * AUTH_SECRET; the audience is what keeps one from being accepted as the
 * other (each verifier pins its own `aud`). Auth.js' own cookie is a JWE with
 * a key DERIVED from the same secret, so none of the three is interchangeable.
 *
 * Own module so `handoff.ts` (imported by the Auth.js config) can sign
 * without importing `api.ts`, which imports the session → config chain.
 *
 * HS256 wants ≥ 256 bits of key. A shorter AUTH_SECRET still signs (the web
 * must not fall over for it — the DB is shared and the prod value is not ours
 * to know here), but it is said ONCE in the log so it gets fixed.
 */
let warnedShortSecret = false;
const MIN_SECRET_CHARS = 32;

export function secretKey(): Uint8Array {
  const secret = env.AUTH_SECRET;
  if (!warnedShortSecret && secret.length < MIN_SECRET_CHARS) {
    warnedShortSecret = true;
    console.warn(
      `[api/v1] AUTH_SECRET tiene ${secret.length} caracteres; HS256 quiere al menos ${MIN_SECRET_CHARS}. Rótalo a un valor más largo (openssl rand -base64 32).`,
    );
  }
  return new TextEncoder().encode(secret);
}

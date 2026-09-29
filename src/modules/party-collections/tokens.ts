import { createHmac, randomBytes } from "node:crypto";

/**
 * Colecciones de fiesta — the two values that need randomness or a secret,
 * split from the pure, client-safe `rules.ts` (a client component importing
 * `node:crypto` fails the whole route: `UnhandledSchemeError`). Server code
 * only; no `server-only` import so `scripts/check-party-rules.ts` can run it
 * under plain `tsx`.
 */

/** 12 random bytes → 16 chars of base64url (96 bits): the link IS the secret.
 *  Shape = `INVITE_TOKEN_RE` (rules.ts). */
export function newInviteToken(): string {
  return randomBytes(12).toString("base64url");
}

/**
 * Per-party opaque reference to a guest (for "Desbloquear"): never the user
 * id, not correlatable across parties, and — keyed with AUTH_SECRET (HMAC,
 * security B3) — not recomputable by anyone who knows or guesses a user id
 * and a party id (a bare sha256 of `backlogId:userId` would let a host test
 * "is this blocked guest user X?"). Rotating AUTH_SECRET changes every ref;
 * refs are only ever read back from a fresh `blockedGuests`, so nothing
 * breaks beyond an open "Bloqueados" sheet needing a reload.
 * Shape = `GUEST_REF_RE` (rules.ts).
 */
export function guestRefOf(backlogId: string, userId: string): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("guestRefOf: AUTH_SECRET is not set");
  return createHmac("sha256", secret).update(`party-guest:${backlogId}:${userId}`).digest("base64url").slice(0, 22);
}

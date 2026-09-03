/**
 * F3.11 foto de perfil — the constants both sides of the upload agree on.
 * Isomorphic on purpose: the picker (client) resizes to AVATAR_SIZE and
 * refuses anything over AVATAR_MAX_BYTES before uploading, and the action
 * (server) enforces the same ceiling — the UI check is the courtesy, the
 * server check is the rule.
 */

/** Square edge, in px, of the stored photo. 512 covers the 96px orb at 4×. */
export const AVATAR_SIZE = 512;

/** Hard cap on the stored bytes. A 512px WebP lands around 20–40 KB; the cap
 *  leaves room for a noisy JPEG fallback and stays far under the 1 MB server
 *  action body limit. */
export const AVATAR_MAX_BYTES = 400 * 1024;

/** The only encodings accepted — what a canvas can emit. Never SVG. */
export const AVATAR_TYPES = ["image/webp", "image/jpeg", "image/png"] as const;
export type AvatarType = (typeof AVATAR_TYPES)[number];

/** 32 lowercase hex chars — a UUID without dashes, minted per upload. */
export const AVATAR_KEY_RE = /^[a-f0-9]{32}$/;

export function avatarUrlOf(key: string): string {
  return `/api/avatar/${key}`;
}

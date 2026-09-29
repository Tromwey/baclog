/**
 * Client-safe twins of `modules/party-collections/rules.ts` (`invitePath`,
 * `partyPath`, `DEFAULT_PER_GUEST_LIMIT`): rules.ts imports `node:crypto`
 * (`newInviteToken`, `guestRefOf`), so a client component can't import it —
 * webpack fails the whole route with `UnhandledSchemeError: node:crypto`.
 * Keep these three in step with rules.ts (pending: split rules.ts into a pure
 * client-safe half and a server half, then delete this file).
 */
export const DEFAULT_PER_GUEST_LIMIT = 3;

/** Invite landing path (anonymous-capable). */
export function invitePath(token: string): string {
  return `/f/${token}`;
}

/** Member page path (host + guests, session required). */
export function partyPath(backlogId: string): string {
  return `/c/${backlogId}`;
}

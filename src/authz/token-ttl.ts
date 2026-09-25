/**
 * Lifetime of a Kura iOS bearer (`issueMobileToken` in `./api.ts`). Its own
 * pure module (no `server-only`, no DB) because the push gate
 * (`modules/push/liveness.ts`) derives "is this install still signed in?"
 * from it, and that rule is unit-tested outside Next.
 */
export const MOBILE_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * Shared /api/v1 serializers: DB rows → wire shapes from `../schemas`. Every
 * handler that emits a Title / TitleState / Collection / Person goes through
 * these so the four lanes of phase 1 can't drift from each other. Pure
 * modules (no "server-only"): `scripts/check-wire.ts` parses their output
 * against the zod contract without a DB.
 */
export * from "./title";
export * from "./state";
export * from "./collection";
export * from "./person";

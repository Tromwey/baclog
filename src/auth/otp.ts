import "server-only";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { and, eq, gt, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { users, verificationTokens } from "@/db/schema";
import { convertOnSignup } from "@/modules/growth/waitlist";
import { assignFounderIfEligible } from "@/modules/growth/founder";
import { HANDOFF_IDENTIFIER_PREFIX } from "@/authz/handoff";
import { env } from "@/lib/env";
import { sendMergeOtpEmail, sendOtpEmail } from "./mailer";

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_LENGTH = 6;
/** Min seconds between OTP requests per email (DB-backed: serverless-safe) */
const RESEND_COOLDOWN_MS = 60 * 1000;

function hashCode(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

export class OtpCooldownError extends Error {
  constructor() {
    super("Wait before requesting another code");
    this.name = "OtpCooldownError";
  }
}

/**
 * Deletes EVERY expired `verificationToken` row — anyone's OTP and expired
 * web-handoff rows (`handoff:<jti>`) alike. Live rows (`expires >= now`,
 * which includes every still-usable handoff) are never touched. Returns the
 * number of rows removed.
 *
 * Three callers: `issueOtp` and `verifyOtp` (opportunistic, non-blocking) and
 * the daily cron (`src/app/api/cron/**`), which is what lets the privacy
 * notice promise an unused code is gone "a más tardar al día siguiente" even
 * if nobody signs in for a while. Keep this exact signature — the cron
 * imports it.
 */
export async function sweepExpiredVerificationTokens(): Promise<number> {
  const deleted = await db
    .delete(verificationTokens)
    .where(lt(verificationTokens.expires, new Date()))
    .returning({ identifier: verificationTokens.identifier });
  return deleted.length;
}

/** The sweep is housekeeping, not part of the auth decision: a failure must
 *  never block issuing or verifying a code. Logged loudly, then ignored. */
async function sweepExpiredNonBlocking(): Promise<void> {
  try {
    await sweepExpiredVerificationTokens();
  } catch (err) {
    console.error("[otp] sweep", err);
  }
}

/**
 * App Review's demo accounts: the fixed code for `normalized` when it is one
 * of the comma-separated `APP_REVIEW_EMAIL` addresses (all share the one
 * code) and `APP_REVIEW_CODE` is a valid 6-digit code; null
 * otherwise (every other email, or the feature unset / misconfigured). The
 * reviewer can't read our inbox, so `issueOtp` arms this code instead of
 * mailing a random one. It is stored hashed in a normal row, so verification
 * is the SAME path as any login (5 attempts per issued code, 60 s cooldown,
 * single use) — a static code without that cap would be brute-forceable.
 */
function reviewLoginCode(normalized: string): string | null {
  const reviewEmails = (env.APP_REVIEW_EMAIL ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const code = env.APP_REVIEW_CODE?.trim();
  if (!code || !reviewEmails.includes(normalized)) return null;
  if (!/^\d{6}$/.test(code)) {
    console.error("[otp] APP_REVIEW_CODE must be 6 digits; review login disabled");
    return null;
  }
  return code;
}

export async function issueOtp(email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  // Never touch a handoff/merge row (see `RESERVED_PREFIXES`): the delete
  // below would otherwise burn it. No real email has that shape.
  if (isReservedIdentifier(normalized)) return;

  const [existing] = await db
    .select({ expires: verificationTokens.expires })
    .from(verificationTokens)
    .where(eq(verificationTokens.identifier, normalized))
    .limit(1);
  if (existing) {
    const issuedAt = existing.expires.getTime() - OTP_TTL_MS;
    if (Date.now() - issuedAt < RESEND_COOLDOWN_MS) throw new OtpCooldownError();
  }

  const reviewCode = reviewLoginCode(normalized);
  const code = reviewCode ?? newCode();

  // One live code per email; never store the raw code
  await db
    .delete(verificationTokens)
    .where(eq(verificationTokens.identifier, normalized));
  // Every expired row, anyone's (see `sweepExpiredVerificationTokens`) —
  // non-blocking: a failed sweep never stops a code from being sent.
  await sweepExpiredNonBlocking();
  await db.insert(verificationTokens).values({
    identifier: normalized,
    token: hashCode(code),
    expires: new Date(Date.now() + OTP_TTL_MS),
  });

  if (reviewCode) return; // the reviewer already has it (App Store Connect notes)
  await sendOtpEmail(normalized, code);
}

/** What `verifyOtp` hands back — only what its two callers read (Auth.js
 *  `authorize`: id/email/name; `POST /api/v1/auth/otp/verify`: id/isMinor).
 *  Explicit on purpose: a bare `select()` pulled `birthYear` and every future
 *  column — and a column added to `schema.ts` before its migration is applied
 *  then broke every existing-account sign-in. (The INSERT for a brand-new
 *  account still names every column, as Drizzle does; that one is unavoidable
 *  until the migration lands.) */
const OTP_USER_COLUMNS = {
  id: users.id,
  email: users.email,
  name: users.name,
  emailVerified: users.emailVerified,
  isMinor: users.isMinor,
};

/** Wrong-code guesses allowed before the live code is invalidated. */
const MAX_ATTEMPTS = 5;

/**
 * `verificationToken` namespaces that are NOT a login email (the table is
 * shared, and the web form's `email` is free text). The login OTP never
 * issues, reads, burns attempts on, or deletes a row under any of them:
 *   - `handoff:<jti>`            — web handoff (src/authz/handoff.ts)
 *   - `merge:<destId>:<email>`   — merge-accounts code (phase 4g, below)
 *   - `merge-token:<jti>`        — single-use mergeToken (src/authz/merge-token.ts)
 */
export const MERGE_OTP_IDENTIFIER_PREFIX = "merge:";
export const MERGE_TOKEN_IDENTIFIER_PREFIX = "merge-token:";
const RESERVED_PREFIXES = [
  HANDOFF_IDENTIFIER_PREFIX,
  MERGE_OTP_IDENTIFIER_PREFIX,
  MERGE_TOKEN_IDENTIFIER_PREFIX,
];
function isReservedIdentifier(normalized: string): boolean {
  return RESERVED_PREFIXES.some((p) => normalized.startsWith(p));
}

/**
 * The shared core of every code check (login and merge). Each guess is ONE
 * atomic statement that both checks the cap and spends an attempt:
 *
 *   UPDATE "verificationToken" SET attempts = attempts + 1
 *   WHERE identifier = $1 AND attempts < 5 AND expires > $liveAfter
 *   RETURNING token
 *
 * Only a row that still had an attempt left comes back, so N parallel
 * guesses can never spend more than the 5 attempts the row has (the old
 * select-then-increment let every in-flight guess read the row before the
 * 5th increment landed — learning 2026-09-24-contador-de-intentos-leer-y-
 * luego-escribir). The hash is compared in app code with `timingSafeEqual`;
 * on a match, `DELETE … WHERE identifier AND token RETURNING` picks a single
 * winner. `true` only for that winner.
 *
 * `liveAfter`: the row is usable only while `expires > liveAfter` (login:
 * now; merge rows live 1 h for the per-email cap but their code only 10 min).
 * `deleteAtCap`: the login code's row is removed once its attempts are spent
 * (so a new one can be asked right away, as before); merge rows stay, dead,
 * because they are what the per-email hourly cap counts.
 */
async function consumeCode(
  identifier: string,
  code: string,
  { liveAfter, deleteAtCap }: { liveAfter: Date; deleteAtCap: boolean },
): Promise<boolean> {
  await sweepExpiredNonBlocking();
  const spent = await db
    .update(verificationTokens)
    .set({ attempts: sql`${verificationTokens.attempts} + 1` })
    .where(
      and(
        eq(verificationTokens.identifier, identifier),
        lt(verificationTokens.attempts, MAX_ATTEMPTS),
        gt(verificationTokens.expires, liveAfter),
      ),
    )
    .returning({ token: verificationTokens.token });

  const expected = Buffer.from(hashCode(code), "hex");
  const match = spent.find((r) => {
    const got = Buffer.from(r.token, "hex");
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
  if (!match) {
    if (deleteAtCap) {
      await db
        .delete(verificationTokens)
        .where(
          and(
            eq(verificationTokens.identifier, identifier),
            gte(verificationTokens.attempts, MAX_ATTEMPTS),
          ),
        );
    }
    return false;
  }
  const won = await db
    .delete(verificationTokens)
    .where(
      and(
        eq(verificationTokens.identifier, identifier),
        eq(verificationTokens.token, match.token),
      ),
    )
    .returning({ identifier: verificationTokens.identifier });
  return won.length === 1;
}

/**
 * Single-use verification: deletes the token on success, returns the
 * (found-or-created) user. Returns null on mismatch/expiry — Auth.js then
 * refuses the sign-in. Each miss burns an attempt; at MAX_ATTEMPTS the
 * code dies (kills 6-digit brute force — the attacker gets 5 guesses per
 * issued code, not 10^6).
 */
export async function verifyOtp(email: string, code: string) {
  const normalized = email.trim().toLowerCase();
  // Handoff / merge rows share the table under their own namespaces. An
  // email never has that shape; refusing it here keeps the web form (whose
  // `email` is free text) from ever reading, burning attempts on, or
  // deleting one of them — and a merge code from ever being a login code.
  if (isReservedIdentifier(normalized)) return null;
  if (!(await consumeCode(normalized, code, { liveAfter: new Date(), deleteAtCap: true }))) {
    return null;
  }
  return findOrCreateUserByVerifiedEmail(normalized);
}

// ---------- phase 4g: the merge-accounts code ----------

/**
 * Proof #2 that the caller owns ANOTHER Kura account (the merge SOURCE): a
 * 6-digit code mailed to that account's address. Stored under
 * `merge:<destinationId>:<email>` — bound to the account that asked, so it
 * is never a login code (`verifyOtp` refuses the namespace) and a code asked
 * by one account can't be redeemed by another.
 *
 * No existence oracle: a row is written and the SAME cooldown applies
 * whether or not a Kura account has that email (or it is the caller's own);
 * only a real source gets a real code, and it is mailed AFTER the response
 * (the returned `send`, null when there is nothing to mail) so the response
 * time doesn't say which. The decoy row holds a hash of a random code nobody
 * ever sees: verification against it always fails, with the same 422.
 * Two rate limits: one code a minute per (asker, email), and at most
 * `MERGE_CODES_PER_EMAIL_PER_HOUR` per target email across ALL askers
 * (`MergeOtpCapError`) — each with the 5-attempt atomic cap of
 * `consumeCode`.
 */
export function mergeOtpIdentifier(destinationId: string, normalizedEmail: string): string {
  return `${MERGE_OTP_IDENTIFIER_PREFIX}${destinationId}:${normalizedEmail}`;
}

function newCode(): string {
  return randomInt(0, 10 ** OTP_LENGTH)
    .toString()
    .padStart(OTP_LENGTH, "0");
}

/** A merge row lives 1 h (what the per-email cap counts); its code only
 *  the first 10 min (`OTP_TTL_MS`). */
const MERGE_ROW_TTL_MS = 60 * 60 * 1000;
/** Merge codes per TARGET email per hour, across every asking account. */
export const MERGE_CODES_PER_EMAIL_PER_HOUR = 3;

/** Too many merge codes asked for one email in the last hour. */
export class MergeOtpCapError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("Too many merge codes for this email");
    this.name = "MergeOtpCapError";
  }
}

function mergeRowsForEmail(normalized: string) {
  // No LIKE: `_` in an email is a wildcard (same match as scrub.ts). A valid
  // email has no `:`, so the suffix can only be this address.
  return sql`starts_with(${verificationTokens.identifier}, ${MERGE_OTP_IDENTIFIER_PREFIX})
    and right(${verificationTokens.identifier}, ${normalized.length + 1}) = ${`:${normalized}`}`;
}

export async function issueMergeOtp(
  destinationId: string,
  email: string,
): Promise<{ send: (() => Promise<void>) | null }> {
  const normalized = email.trim().toLowerCase();
  const identifier = mergeOtpIdentifier(destinationId, normalized);
  await sweepExpiredNonBlocking();

  // Per (asker, email): one code a minute, like the login code.
  const [latest] = await db
    .select({ expires: sql<Date>`max(${verificationTokens.expires})`.mapWith(verificationTokens.expires) })
    .from(verificationTokens)
    .where(eq(verificationTokens.identifier, identifier));
  if (latest?.expires) {
    const issuedAt = latest.expires.getTime() - MERGE_ROW_TTL_MS;
    if (Date.now() - issuedAt < RESEND_COOLDOWN_MS) throw new OtpCooldownError();
  }

  // Per TARGET email, across every asking account: a victim's address faces
  // at most 3 codes × 5 attempts an hour, however many accounts ask. Rows
  // live exactly 1 h (swept after), dead or alive, decoy or real — so the
  // count is the same whether or not the account exists (no oracle).
  const [cap] = await db
    .select({
      n: sql<number>`count(*)::int`,
      oldest: sql<Date>`min(${verificationTokens.expires})`.mapWith(verificationTokens.expires),
    })
    .from(verificationTokens)
    .where(and(mergeRowsForEmail(normalized), gt(verificationTokens.expires, new Date())));
  if (cap && Number(cap.n) >= MERGE_CODES_PER_EMAIL_PER_HOUR) {
    const wait = cap.oldest ? Math.ceil((cap.oldest.getTime() - Date.now()) / 1000) : 3600;
    throw new MergeOtpCapError(Math.max(60, wait));
  }

  const [source] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalized))
    .limit(1);
  const real = !!source && source.id !== destinationId;
  const code = newCode();

  // The asker's previous code for this email dies (attempts spent) but its
  // row stays until its hour is up: it still counts toward the cap.
  await db
    .update(verificationTokens)
    .set({ attempts: MAX_ATTEMPTS })
    .where(eq(verificationTokens.identifier, identifier));
  await db.insert(verificationTokens).values({
    identifier,
    // Decoy: the hash of a code nobody receives (never the real one).
    token: hashCode(real ? code : newCode()),
    expires: new Date(Date.now() + MERGE_ROW_TTL_MS),
  });

  return { send: real ? () => sendMergeOtpEmail(normalized, code) : null };
}

/**
 * The merge SOURCE's id when `code` is the live merge code this destination
 * asked for `email` and a Kura account (other than the caller) still has
 * that email; null otherwise — one null for wrong code, expired code, decoy
 * row and missing account (the caller answers ONE 422). Same 5-attempt cap
 * as the login code.
 */
export async function verifyMergeOtp(
  destinationId: string,
  email: string,
  code: string,
): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  // The code is good for its first 10 minutes; the row lives an hour.
  const liveAfter = new Date(Date.now() + MERGE_ROW_TTL_MS - OTP_TTL_MS);
  const ok = await consumeCode(mergeOtpIdentifier(destinationId, normalized), code, {
    liveAfter,
    deleteAtCap: false,
  });
  if (!ok) return null;
  const [source] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalized))
    .limit(1);
  if (!source || source.id === destinationId) return null;
  return source.id;
}

/**
 * The account behind an email that was JUST proven (an OTP typed back, or a
 * provider's `email_verified` identity — `src/auth/social.ts`): the existing
 * row (stamping `emailVerified` if it was never set), or a new one with the
 * one-time sign-up hooks (F3.1 waitlist link, F3.2 founder badge;
 * best-effort — a hook failure never blocks the sign-in). `email` must
 * already be trimmed + lowercased. Returns the explicit `OTP_USER_COLUMNS`,
 * never a bare `select()`.
 *
 * Two concurrent first sign-ins of the same email race on the unique index:
 * the loser's insert is a no-op (`onConflictDoNothing`) and it re-reads the
 * winner's row, so both land on ONE account and only the winner runs hooks.
 */
export async function findOrCreateUserByVerifiedEmail(normalized: string) {
  const [existing] = await db
    .select(OTP_USER_COLUMNS)
    .from(users)
    .where(eq(users.email, normalized))
    .limit(1);
  if (existing) {
    if (!existing.emailVerified) {
      await db
        .update(users)
        .set({ emailVerified: new Date() })
        .where(eq(users.id, existing.id));
    }
    return existing;
  }
  const [created] = await db
    .insert(users)
    .values({ email: normalized, emailVerified: new Date() })
    .onConflictDoNothing({ target: users.email })
    .returning(OTP_USER_COLUMNS);
  if (!created) {
    const [winner] = await db
      .select(OTP_USER_COLUMNS)
      .from(users)
      .where(eq(users.email, normalized))
      .limit(1);
    if (!winner) throw new Error("findOrCreateUserByVerifiedEmail: row vanished after conflict");
    return winner;
  }
  // One-time-at-account-creation hooks (F3.1 waitlist link + F3.2 badge).
  // Best-effort: a failure here must not block sign-in.
  try {
    await assignFounderIfEligible(created.id);
    await convertOnSignup(normalized, created.id);
  } catch (err) {
    console.error("[otp] post-signup hooks failed:", err);
  }
  return created;
}

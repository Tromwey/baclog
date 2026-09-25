import "server-only";
import { createHash, randomInt } from "node:crypto";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { users, verificationTokens } from "@/db/schema";
import { convertOnSignup } from "@/modules/growth/waitlist";
import { assignFounderIfEligible } from "@/modules/growth/founder";
import { HANDOFF_IDENTIFIER_PREFIX } from "@/authz/handoff";
import { sendOtpEmail } from "./mailer";

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

export async function issueOtp(email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();

  const [existing] = await db
    .select({ expires: verificationTokens.expires })
    .from(verificationTokens)
    .where(eq(verificationTokens.identifier, normalized))
    .limit(1);
  if (existing) {
    const issuedAt = existing.expires.getTime() - OTP_TTL_MS;
    if (Date.now() - issuedAt < RESEND_COOLDOWN_MS) throw new OtpCooldownError();
  }

  const code = randomInt(0, 10 ** OTP_LENGTH)
    .toString()
    .padStart(OTP_LENGTH, "0");

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
 * Single-use verification: deletes the token on success, returns the
 * (found-or-created) user. Returns null on mismatch/expiry — Auth.js then
 * refuses the sign-in. Each miss burns an attempt; at MAX_ATTEMPTS the
 * code dies (kills 6-digit brute force — the attacker gets 5 guesses per
 * issued code, not 10^6).
 */
export async function verifyOtp(email: string, code: string) {
  const normalized = email.trim().toLowerCase();
  // `verificationToken` also holds the one-shot web handoff rows
  // (src/authz/handoff.ts) under `handoff:<jti>`. An email never has that
  // shape; refusing it here keeps the web form (whose `email` is free text)
  // from ever reading, burning attempts on, or deleting a handoff row.
  if (normalized.startsWith(HANDOFF_IDENTIFIER_PREFIX)) return null;
  // Same housekeeping as `issueOtp` (non-blocking). An expired code for
  // THIS email goes too — the lookup below then misses, which is the same
  // null an expired code already got.
  await sweepExpiredNonBlocking();
  const [row] = await db
    .select()
    .from(verificationTokens)
    .where(
      and(
        eq(verificationTokens.identifier, normalized),
        eq(verificationTokens.token, hashCode(code)),
      ),
    )
    .limit(1);
  if (!row) {
    // Wrong code: burn an attempt on this email's live token (if any)
    await db
      .update(verificationTokens)
      .set({ attempts: sql`${verificationTokens.attempts} + 1` })
      .where(eq(verificationTokens.identifier, normalized));
    await db
      .delete(verificationTokens)
      .where(
        and(
          eq(verificationTokens.identifier, normalized),
          gte(verificationTokens.attempts, MAX_ATTEMPTS),
        ),
      );
    return null;
  }
  if (row.expires < new Date() || row.attempts >= MAX_ATTEMPTS) return null;

  await db
    .delete(verificationTokens)
    .where(eq(verificationTokens.identifier, normalized));

  return findOrCreateUserByVerifiedEmail(normalized);
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

import "server-only";
import { createHash, randomInt } from "node:crypto";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { users, verificationTokens } from "@/db/schema";
import { convertOnSignup } from "@/modules/growth/waitlist";
import { assignFounderIfEligible } from "@/modules/growth/founder";
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
  await db.insert(verificationTokens).values({
    identifier: normalized,
    token: hashCode(code),
    expires: new Date(Date.now() + OTP_TTL_MS),
  });

  await sendOtpEmail(normalized, code);
}

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

  let [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, normalized))
    .limit(1);
  if (!user) {
    [user] = await db
      .insert(users)
      .values({ email: normalized, emailVerified: new Date() })
      .returning();
    // One-time-at-account-creation hooks (F3.1 waitlist link + F3.2 badge).
    // Best-effort: a failure here must not block sign-in.
    try {
      await assignFounderIfEligible(user.id);
      await convertOnSignup(normalized, user.id);
    } catch (err) {
      console.error("[otp] post-signup hooks failed:", err);
    }
  } else if (!user.emailVerified) {
    await db
      .update(users)
      .set({ emailVerified: new Date() })
      .where(eq(users.id, user.id));
  }
  return user;
}

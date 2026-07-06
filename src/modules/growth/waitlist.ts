import "server-only";
import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { waitlistEntries, waitlistReferrals } from "@/db/schema";

/** Queue positions a confirmed referral moves you up. */
const BOOST_PER_REFERRAL = 3;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars

export interface WaitlistResult {
  position: number;
  referralCode: string;
  referralCount: number;
  alreadyJoined: boolean;
}

function generateCode(len = 8): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

/** 1-based rank by effective sequence (lower = closer to the front). */
async function positionForEffectiveSeq(effectiveSeq: number): Promise<number> {
  const [row] = await db
    .select({ ahead: sql<number>`count(*)::int` })
    .from(waitlistEntries)
    .where(
      sql`(${waitlistEntries.sequence} - ${waitlistEntries.referralCount} * ${BOOST_PER_REFERRAL}) < ${effectiveSeq}`,
    );
  return (row?.ahead ?? 0) + 1;
}

function effectiveSeq(sequence: number, referralCount: number): number {
  return sequence - referralCount * BOOST_PER_REFERRAL;
}

/**
 * F3.1 — idempotent join. Re-joining with the same email returns the
 * existing entry (no duplicate). A valid `refCode` credits the referrer
 * immediately (guarded by the unique index on refereeEntryId — one credit
 * per referee, ever). Credit-on-join gives the real "invita y sube"
 * behavior; abuse is vanity-only (M3 doesn't gate signups on position).
 */
export async function joinWaitlist(
  rawEmail: string,
  refCode?: string,
): Promise<WaitlistResult> {
  const email = rawEmail.trim().toLowerCase();

  const [existing] = await db
    .select()
    .from(waitlistEntries)
    .where(eq(waitlistEntries.email, email))
    .limit(1);
  if (existing) {
    return {
      position: await positionForEffectiveSeq(
        effectiveSeq(existing.sequence, existing.referralCount),
      ),
      referralCode: existing.referralCode,
      referralCount: existing.referralCount,
      alreadyJoined: true,
    };
  }

  let referrer: { id: string } | undefined;
  if (refCode) {
    [referrer] = await db
      .select({ id: waitlistEntries.id })
      .from(waitlistEntries)
      .where(eq(waitlistEntries.referralCode, refCode.trim().toUpperCase()))
      .limit(1);
  }

  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${waitlistEntries.sequence}), 0) + 1` })
    .from(waitlistEntries);

  const [entry] = await db
    .insert(waitlistEntries)
    .values({
      email,
      referralCode: generateCode(),
      referredByEntryId: referrer?.id ?? null,
      sequence: next,
    })
    .returning();

  if (referrer) {
    // Credit the referrer once; unique(refereeEntryId) makes retries no-ops
    const credited = await db
      .insert(waitlistReferrals)
      .values({ referrerEntryId: referrer.id, refereeEntryId: entry.id })
      .onConflictDoNothing({ target: waitlistReferrals.refereeEntryId })
      .returning({ id: waitlistReferrals.id });
    if (credited.length > 0) {
      await db
        .update(waitlistEntries)
        .set({ referralCount: sql`${waitlistEntries.referralCount} + 1` })
        .where(eq(waitlistEntries.id, referrer.id));
    }
  }

  return {
    position: await positionForEffectiveSeq(effectiveSeq(entry.sequence, 0)),
    referralCode: entry.referralCode,
    referralCount: 0,
    alreadyJoined: false,
  };
}

/** Links a waitlist entry to a real account at signup (called from otp.ts). */
export async function convertOnSignup(
  rawEmail: string,
  userId: string,
): Promise<void> {
  const email = rawEmail.trim().toLowerCase();
  await db
    .update(waitlistEntries)
    .set({ convertedUserId: userId, convertedAt: new Date() })
    .where(eq(waitlistEntries.email, email));
}

import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { waitlistEntries, waitlistReferrals } from "@/db/schema";
import { secretKey } from "@/authz/keys";

/** Queue positions a confirmed referral moves you up. */
const BOOST_PER_REFERRAL = 3;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars

/**
 * What a join answers. `position` / `referralCode` / `referralCount` are the
 * entry's OWN data and travel only to someone who is that entry: the caller
 * who just created it, or one who presents its `proof` (below). For an email
 * that was already in line and no proof, the answer is `alreadyJoined: true`
 * and nothing else — the form is anonymous and the email is free text, so
 * anything more was a lookup of somebody else's place in line, invite count
 * and invite code by address.
 */
export interface WaitlistResult {
  alreadyJoined: boolean;
  position?: number;
  referralCode?: string;
  referralCount?: number;
}

/**
 * "This browser is the one that joined with this email": HMAC-SHA256 of the
 * normalized address under AUTH_SECRET. The action stores it in an httpOnly
 * cookie when an entry is CREATED and sends it back on a re-join; nothing is
 * stored in the database and it can't be derived from the invite code (which
 * is public — it rides in every share link).
 */
export function waitlistProof(rawEmail: string): string {
  return createHmac("sha256", secretKey())
    .update(`waitlist-proof:${rawEmail.trim().toLowerCase()}`)
    .digest("hex");
}

function proofMatches(email: string, proof: string | null | undefined): boolean {
  if (!proof) return false;
  const expected = Buffer.from(waitlistProof(email), "hex");
  const got = Buffer.from(proof, "hex");
  return got.length === expected.length && timingSafeEqual(got, expected);
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
 * F3.1 — idempotent join. Re-joining with the same email creates nothing; it
 * returns the existing entry's data ONLY to a caller holding its `proof`
 * (see `WaitlistResult`). A valid `refCode` credits the referrer
 * immediately (guarded by the unique index on refereeEntryId — one credit
 * per referee, ever). Credit-on-join gives the real "invita y sube"
 * behavior; abuse is vanity-only (M3 doesn't gate signups on position).
 */
export async function joinWaitlist(
  rawEmail: string,
  refCode?: string,
  proof?: string | null,
): Promise<WaitlistResult> {
  const email = rawEmail.trim().toLowerCase();

  const [existing] = await db
    .select()
    .from(waitlistEntries)
    .where(eq(waitlistEntries.email, email))
    .limit(1);
  if (existing) {
    if (!proofMatches(email, proof)) return { alreadyJoined: true };
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

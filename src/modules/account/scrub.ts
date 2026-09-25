import "server-only";
import { eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  analyticsEvents,
  users,
  verificationTokens,
  waitlistEntries,
} from "@/db/schema";
import { MERGE_OTP_IDENTIFIER_PREFIX } from "@/auth/otp";

/**
 * The statements that scrub an account's EMAIL and HANDLE from the tables
 * that store them as text without a FK to `user` (so no cascade reaches
 * them). Shared by EVERY path that makes an account disappear — `deleteAccount`
 * (the user leaves) and `mergeAccounts` (the source account is absorbed) —
 * so the two can never scrub differently (AGENTS.md: every deletion path goes
 * through the same scrubs). They must run in the SAME `db.batch` as the
 * `delete from "user"` and BEFORE it: each one reads the email/handle through
 * a subquery on the user row by id (no read-then-write window, no extra round
 * trip), which is gone once the row is.
 *
 *   - `waitlist_entry`: the entry is deleted (not just unlinked — the FK's
 *     `set null` would leave the email behind). Matched by email as stored
 *     (`joinWaitlist` lowercases + trims) OR by `converted_user_id`. Its
 *     `waitlist_referral` rows cascade; the referrer's `referral_count` stays
 *     (a count, no identity).
 *   - `analytics_event.target_username`: nulled where it is the account's
 *     CURRENT handle. That covers the whole history because, since phase 4b,
 *     `claimUsername` rewrites `target_username` old → new on every rename
 *     (inside the rename's own transaction, under a lock on the user row).
 *     Renames from BEFORE 4b were nulled by the one-off cleanup of 2026-09-24.
 *   - `verificationToken`: a still-live login code (identifier = the email),
 *     and — phase 4g — the merge codes the account ASKED for
 *     (`merge:<id>:<email>`) and the ones asked FOR its email
 *     (`merge:<anyone>:<email>`). Expired rows are already swept by the OTP
 *     functions and the daily cron. Handoff/merge-token rows carry no email.
 *
 * If you add a table that stores an email or a handle as text, scrub it here
 * and update `app/(marketing)/privacidad/content.ts`.
 */
export function identityScrubStatements(userId: string) {
  const email = sql`(select lower(${users.email}) from ${users} where ${users.id} = ${userId})`;
  const handle = sql`(select lower(${users.username}) from ${users} where ${users.id} = ${userId})`;
  return [
    db
      .delete(waitlistEntries)
      .where(
        or(
          eq(waitlistEntries.convertedUserId, userId),
          sql`lower(${waitlistEntries.email}) = ${email}`,
        ),
      ),
    // A null handle makes `= (null)` false: a user who never claimed one
    // touches no rows.
    db
      .update(analyticsEvents)
      .set({ targetUsername: null })
      .where(sql`lower(${analyticsEvents.targetUsername}) = ${handle}`),
    // `right(…) = ':' || email` instead of LIKE: an email may contain `_`,
    // a LIKE wildcard, and would match someone else's row. A valid email has
    // no `:`, so the suffix can only be this address.
    db.delete(verificationTokens).where(
      sql`${verificationTokens.identifier} = ${email}
        or starts_with(${verificationTokens.identifier}, ${`${MERGE_OTP_IDENTIFIER_PREFIX}${userId}:`})
        or (starts_with(${verificationTokens.identifier}, ${MERGE_OTP_IDENTIFIER_PREFIX})
            and right(${verificationTokens.identifier}, length(${email}) + 1) = ':' || ${email})`,
    ),
  ] as const;
}

import "server-only";
import { eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  analyticsEvents,
  users,
  verificationTokens,
  waitlistEntries,
} from "@/db/schema";

/**
 * F2.4 — deletes the user row; every user-owned table cascades (backlogs,
 * items, user_item, item_review, user_follow both ways, user_avatar,
 * reports-against). catalog_item / media_link are shared cache, not user
 * data. No "why are you leaving" email — just gone. Revocation is implicit:
 * both the cookie session and the mobile bearer re-read `users` per request,
 * so the next call from either is a 401. Takes a `userId`: never a "use
 * server" file; the action signs out + redirects, the API answers 204.
 *
 * Fase 4b — the tables that hold the user's EMAIL or HANDLE without a FK to
 * `user` (so no cascade reaches them) are scrubbed in the SAME batch (Neon
 * HTTP `batch` = one transaction), BEFORE the user row goes. Each statement
 * reads the email/handle through a subquery on `user` by id, so there is no
 * read-then-write window and no second round trip:
 *   - `waitlist_entry`: the entry is deleted (not just unlinked — the FK's
 *     `set null` would leave the email behind). Matched by email as it was
 *     stored (`joinWaitlist` lowercases + trims) OR by `converted_user_id`.
 *     Its `waitlist_referral` rows cascade; the referrer's
 *     `referral_count` stays (a count, no identity).
 *   - `analytics_event.target_username`: nulled where it is the user's
 *     CURRENT handle. That covers the whole history because, since phase 4b,
 *     `claimUsername` rewrites `target_username` old → new on every rename
 *     (inside the rename's own transaction, under a lock on the user row),
 *     so events never stay behind under a handle the user no longer has.
 *     Renames from BEFORE 4b did leave events under released handles; those
 *     were nulled by the one-off cleanup of 2026-09-24 (every
 *     `target_username` no current account holds → null).
 *   - `verificationToken` rows whose identifier is the email: a still-live
 *     login code (an expired one is already swept by `issueOtp`/`verifyOtp`
 *     and the daily cron, `sweepExpiredVerificationTokens`). Handoff rows
 *     (`handoff:<jti>`) carry no email and are untouched.
 * Identity-free aggregates (`release_notice`, counts) cascade or stay as-is.
 * If you add a table that stores an email or a handle as text, scrub it here
 * too and update `app/(marketing)/privacidad/content.ts`.
 */
export async function deleteAccount(userId: string): Promise<void> {
  const email = sql`(select lower(${users.email}) from ${users} where ${users.id} = ${userId})`;
  const handle = sql`(select lower(${users.username}) from ${users} where ${users.id} = ${userId})`;

  await db.batch([
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
    db.delete(verificationTokens).where(sql`${verificationTokens.identifier} = ${email}`),
    db.delete(users).where(eq(users.id, userId)),
  ]);
}

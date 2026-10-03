import { redactedError } from "@/authz/safe-log";
import { NextResponse } from "next/server";
import { and, eq, notExists, sql } from "drizzle-orm";
import { db } from "@/db";
import { recapSends, users } from "@/db/schema";
import { cronBudget, deliverOnce, isAuthorizedCron, STALE_CLAIM } from "@/lib/cron";
import { buildMonthlyRecap, hadActivityIn, previousMonthKey } from "@/modules/backlog/recap";
import { sendRecapEmail } from "@/auth/mailer";

export const maxDuration = 60;

/**
 * F3.3 — monthly recap cron (Vercel Cron, days 1–3 of each month, see
 * `vercel.json`). Idempotent via the recap_send unique(user_id, era_key): the
 * INSERT ... ON CONFLICT ... RETURNING is the atomic claim, safe against
 * at-least-once delivery and manual re-triggers. One user's failure never
 * aborts the batch.
 *
 * THREE days, one month. `previousMonthKey()` is the UTC month before the
 * run's, so the runs of days 1, 2 and 3 all address the SAME era; the second
 * and third only find whoever is still pending (a run cut at `maxDuration`,
 * a mail provider that was down, a claim left behind), and cost one query
 * when nobody is. Before, a truncated day-1 run answered 500 and nothing
 * resumed it until the next month — when the era had already moved on.
 *
 * The audience, filtered in the query and NOT at send time (the posture of
 * cron/release's `pendingRecipient`):
 * - `notifyRecap` on (the opt-out: Ajustes web, `PATCH /me`). An opted-out
 *   user never claims a `recap_send` row, so switching it back on before a
 *   re-run of the same month doesn't find that month already "sent";
 * - activity in the month (`hadActivityIn` = `deriveEras` in SQL). A user
 *   with nothing to recap takes no claim and costs no library read. That is
 *   what makes a `recap_send` row without `email_sent_at` unambiguous: it is
 *   an unfinished send, never "claimed, had nothing to say" (rows like that
 *   from before this rule belong to users this filter leaves out);
 * - no FINAL claim for the month: a row with `email_sent_at` is final; one
 *   without it only blocks while younger than `STALE_CLAIM` (a live run).
 *   Older, it is an abandoned claim — the function died between the claim
 *   and the send, or the release after a failed send failed too — and the
 *   conflict arm of the claim adopts it, in the same statement, so two runs
 *   can't both take it. Before, such a row kept its user out of that month
 *   forever.
 *
 * Retryable by construction (`deliverOnce` in lib/cron.ts):
 * - a user whose recap failed to BUILD or to SEND gets their claim released,
 *   so the next run of the same month picks them up again;
 * - the run stops before `maxDuration` (`cronBudget`) and says so
 *   (`truncated`): whoever wasn't reached has no claim and is still pending.
 *
 * 500 when anyone failed, a sent email couldn't be stamped, or the run was
 * cut short, so a run that didn't reach everybody never looks green.
 * Re-running it (same URL, same bearer) is always safe.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const budget = cronBudget(maxDuration);

  const eraKey = previousMonthKey();
  const pending = await db
    .select({ id: users.id, email: users.email, username: users.username })
    .from(users)
    .where(
      and(
        eq(users.notifyRecap, true),
        hadActivityIn(users.id, eraKey),
        notExists(
          db
            .select({ one: sql`1` })
            .from(recapSends)
            .where(
              and(
                eq(recapSends.userId, users.id),
                eq(recapSends.eraKey, eraKey),
                sql`(${recapSends.emailSentAt} is not null or ${recapSends.createdAt} > ${STALE_CLAIM})`,
              ),
            ),
        ),
      ),
    );

  let sent = 0;
  // The audience query said "activity" and the recap came back empty: the
  // activity went away in between (a title removed mid-run). The claim is
  // released, so the row never reads as an unfinished send.
  let empty = 0;
  // Another run holds the claim (overlap / manual re-trigger).
  let skipped = 0;
  let failed = 0;
  // The email went out but `email_sent_at` didn't get stamped: the user WAS
  // told. The claim is kept (releasing it would mail them again right now);
  // once it goes stale it is re-sent — "twice" over "never", see STALE_CLAIM.
  let stampFailed = 0;
  let processed = 0;

  for (const u of pending) {
    if (budget.exhausted()) break;
    processed++;
    try {
      let claimId: string | null = null;
      const release = (id: string) => db.delete(recapSends).where(eq(recapSends.id, id));
      const outcome = await deliverOnce({
        label: `[cron/recap] user ${u.id} (${eraKey})`,
        claim: async () => {
          const [claimed] = await db
            .insert(recapSends)
            .values({ userId: u.id, eraKey })
            // Conflict = a row exists. Take it over ONLY if it is an
            // abandoned claim (never sent, older than STALE_CLAIM);
            // re-stamping created_at makes it a live claim again, so a
            // racing run's identical statement matches nothing.
            .onConflictDoUpdate({
              target: [recapSends.userId, recapSends.eraKey],
              set: { createdAt: sql`now()` },
              setWhere: sql`${recapSends.emailSentAt} is null and ${recapSends.createdAt} <= ${STALE_CLAIM}`,
            })
            .returning({ id: recapSends.id });
          claimId = claimed?.id ?? null;
          return claimed;
        },
        send: async () => {
          const recap = await buildMonthlyRecap(u.id, eraKey);
          if (!recap) return "nothing";
          await sendRecapEmail(u.email, recap);
          return "sent";
        },
        release: (claimed) => release(claimed.id),
      });
      if (outcome === "already") skipped++;
      else if (outcome === "nothing") {
        empty++;
        await release(claimId!);
      } else {
        sent++;
        try {
          await db
            .update(recapSends)
            .set({ emailSentAt: new Date() })
            .where(eq(recapSends.id, claimId!));
        } catch (err) {
          console.error(
            `[cron/recap] claim ${claimId} (user ${u.id}): email sent but email_sent_at not stamped (it will be re-sent once the claim goes stale):`, redactedError(err));
          stampFailed++;
        }
      }
    } catch (err) {
      console.error(`[cron/recap] user ${u.id} failed:`, redactedError(err));
      failed++;
    }
  }

  const unprocessed = pending.length - processed;
  const truncated = unprocessed > 0;
  if (truncated) {
    console.error(
      `[cron/recap] ${eraKey}: cut at ${budget.elapsedMs()} ms with ${unprocessed} user(s) not reached — they hold no claim; the next scheduled run (days 1–3) or a manual re-run finishes`,
    );
  }
  const ok = failed === 0 && stampFailed === 0 && !truncated;
  return NextResponse.json(
    {
      eraKey,
      sent,
      empty,
      skipped,
      failed,
      stampFailed,
      truncated,
      unprocessed,
      total: pending.length,
    },
    { status: ok ? 200 : 500 },
  );
}

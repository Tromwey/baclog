import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { env } from "@/lib/env";
import { db } from "@/db";
import { recapSends, users } from "@/db/schema";
import { buildMonthlyRecap, previousMonthKey } from "@/modules/backlog/recap";
import { sendRecapEmail } from "@/auth/mailer";

export const maxDuration = 60;

/**
 * F3.3 — monthly recap cron (Vercel Cron, day 1 of each month). Idempotent
 * via the recap_send unique(user_id, era_key): the INSERT ... ON CONFLICT
 * DO NOTHING RETURNING is the atomic claim, safe against at-least-once
 * delivery and manual re-triggers. One user's failure never aborts the batch.
 */
export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const eraKey = previousMonthKey();
  const allUsers = await db
    .select({ id: users.id, email: users.email, username: users.username })
    .from(users);

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const u of allUsers) {
    try {
      const [claimed] = await db
        .insert(recapSends)
        .values({ userId: u.id, eraKey })
        .onConflictDoNothing({
          target: [recapSends.userId, recapSends.eraKey],
        })
        .returning({ id: recapSends.id });
      if (!claimed) {
        skipped++;
        continue;
      }

      const recap = await buildMonthlyRecap(u.id, eraKey, u.username);
      if (!recap) continue; // no activity that month — claim stays, no email

      await sendRecapEmail(u.email, recap);
      await db
        .update(recapSends)
        .set({ emailSentAt: new Date() })
        .where(eq(recapSends.id, claimed.id));
      sent++;
    } catch (err) {
      console.error(`[cron/recap] user ${u.id} failed:`, err);
      failed++;
    }
  }

  return NextResponse.json({ eraKey, sent, skipped, failed, total: allUsers.length });
}

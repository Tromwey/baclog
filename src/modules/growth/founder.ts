import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

const FOUNDER_COHORT_SIZE = 100;

/**
 * F3.2 — called once, right after a NEW user row is created. If the account
 * is within the first ~100, stamp the founder badge + rank. Count-then-set
 * has a tiny race window near the boundary (worst case: cohort of 101-102),
 * accepted — this is a vanity badge, not a security boundary; not worth a
 * lock over ~100 rows. Seeded micro-curators are flagged separately by the
 * founder-run scripts/seed-curators.ts (isFounder=true, founderRank=null).
 */
export async function assignFounderIfEligible(userId: string): Promise<void> {
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(users);
  if (total > FOUNDER_COHORT_SIZE) return;
  await db
    .update(users)
    .set({ isFounder: true, founderRank: total })
    .where(eq(users.id, userId));
}

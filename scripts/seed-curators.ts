/**
 * F3.2 — founder-run script to grant the founder badge to manually-sourced
 * micro-curators (isFounder=true, founderRank=null — badge, no rank number).
 *
 * Usage: pnpm tsx scripts/seed-curators.ts email1@x.com email2@y.com …
 * (or pass usernames — matched case-insensitively against email or username)
 *
 * This is deliberately NOT a UI feature or API route: seeding curators is
 * manual outreach (see the distribution playbook), not a self-service flow.
 */
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

config({ path: ".env.local" });

async function main() {
  const args = process.argv.slice(2).map((a) => a.trim().toLowerCase());
  if (args.length === 0) {
    console.error("Usage: pnpm tsx scripts/seed-curators.ts <email|username> …");
    process.exit(1);
  }

  const list = sql.join(
    args.map((a) => sql`${a}`),
    sql`, `,
  );
  const updated = await db
    .update(users)
    .set({ isFounder: true })
    .where(
      sql`lower(${users.email}) in (${list}) or lower(${users.username}) in (${list})`,
    )
    .returning({ email: users.email, username: users.username });

  console.log(`Flagged ${updated.length} curator(s) as founders:`);
  for (const u of updated) console.log(` - ${u.username ?? u.email}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

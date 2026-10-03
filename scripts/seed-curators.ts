/**
 * F3.2 — founder-run script to grant the founder badge to manually-sourced
 * micro-curators (isFounder=true, founderRank=null — badge, no rank number).
 *
 * Usage: pnpm tsx scripts/seed-curators.ts --yes email1@x.com email2@y.com …
 * (or pass usernames — matched case-insensitively against email or username)
 *
 * This is deliberately NOT a UI feature or API route: seeding curators is
 * manual outreach (see the distribution playbook), not a self-service flow.
 *
 * It WRITES to whatever `DATABASE_URL` in `.env.local` points at (the shared
 * database): `db-write-guard.ts` prints the host and requires `--yes`. The
 * environment is loaded BEFORE `@/db` is imported — a static import built the
 * client first, so the script used the shell's `DATABASE_URL` or died on a
 * missing one before `config()` ever ran.
 */
import { confirmDbWrite, loadScriptEnv } from "./db-write-guard";

loadScriptEnv();

async function main() {
  const raw = process.argv.slice(2);
  if (raw.filter((a) => a !== "--yes").length === 0) {
    console.error("Usage: pnpm tsx scripts/seed-curators.ts --yes <email|username> …");
    process.exit(1);
  }
  const args = confirmDbWrite("seed-curators: marca isFounder = true en las cuentas indicadas", raw).map((a) =>
    a.trim().toLowerCase(),
  );
  const { sql } = await import("drizzle-orm");
  const { db } = await import("@/db");
  const { users } = await import("@/db/schema");

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

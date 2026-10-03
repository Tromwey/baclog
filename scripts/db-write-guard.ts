/**
 * The guard every script that WRITES to the database goes through.
 *
 * `.env.local` points `DATABASE_URL` at the SHARED database (beta and prod
 * read the same one), so a script run "to try it" writes to production. The
 * guard makes that a decision instead of an accident:
 *   1. the environment must be loaded BEFORE `@/db` is imported (`@/db`
 *      builds its client at import time) — call `loadScriptEnv()` first and
 *      import `@/db` dynamically afterwards;
 *   2. the host of the database is printed before anything is written;
 *   3. without an explicit `--yes` the script stops (exit 1) having written
 *      nothing.
 * Not for the harnesses (`db-harness/`, `otp-sql-harness.ts`): those refuse
 * anything but a loopback Postgres on their own.
 */
import { config } from "dotenv";

export function loadScriptEnv(): void {
  config({ path: ".env.local" });
}

/** Host (and database name) of `DATABASE_URL` — never the credentials. */
export function databaseTarget(url: string | undefined = process.env.DATABASE_URL): string {
  if (!url) return "(DATABASE_URL sin definir)";
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`;
  } catch {
    return "(DATABASE_URL ilegible)";
  }
}

/**
 * Prints where `what` is about to write and requires `--yes` in `argv`.
 * Returns `argv` without the flag (so positional arguments stay clean).
 */
export function confirmDbWrite(what: string, argv: string[] = process.argv.slice(2)): string[] {
  const target = databaseTarget();
  console.log(`[db] ${what}\n[db] base de datos: ${target}`);
  if (!process.env.DATABASE_URL) {
    console.error("[db] falta DATABASE_URL (¿.env.local?). No se escribió nada.");
    process.exit(1);
  }
  if (!argv.includes("--yes")) {
    console.error("[db] esto ESCRIBE en esa base de datos. Repite el comando con --yes para confirmarlo. No se escribió nada.");
    process.exit(1);
  }
  return argv.filter((a) => a !== "--yes");
}

import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import pg from "pg";
import * as schema from "../../src/db/schema";
/**
 * `@/db` for the DB harness (`pnpm test:db`): the REAL modules, but on
 * node-postgres against a THROWAWAY local Postgres instead of neon-http.
 * See run.ts for how to create the database.
 *
 * The harness TRUNCATEs. It therefore refuses anything that is not a
 * loopback host — the project's DATABASE_URL is the shared production
 * database and must never reach this file (it reads its own variable).
 */
const url = process.env.HARNESS_DATABASE_URL ?? "postgres://postgres@127.0.0.1:54399/kura";
const host = new URL(url).hostname;
if (host !== "127.0.0.1" && host !== "localhost" && host !== "[::1]") {
  throw new Error(`db-harness: HARNESS_DATABASE_URL apunta a "${host}"; solo se permite un Postgres local desechable`);
}
export const pool = new pg.Pool({ connectionString: url, max: 1 });
const base = drizzle(pool, { schema });
// neon-http's batch = one transaction; with max:1 every statement shares the connection.
export const db = Object.assign(base, {
  batch: async (qs: PromiseLike<unknown>[]) => {
    await base.execute(sql`begin`);
    try {
      const out = [];
      for (const q of qs) out.push(await q);
      await base.execute(sql`commit`);
      return out;
    } catch (e) {
      await base.execute(sql`rollback`);
      throw e;
    }
  },
});

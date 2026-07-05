import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { env } from "@/lib/env";
import * as schema from "./schema";

/**
 * Neon HTTP driver: each query is a fetch — ideal for Vercel route
 * handlers/server actions (no connection pool to manage, works locally too).
 */
const sql = neon(env.DATABASE_URL);

export const db = drizzle(sql, { schema });

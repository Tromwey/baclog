import "server-only";
import { sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { userItems } from "@/db/schema";

/**
 * Descubrir's one rule about the viewer's own library (founder, 2026-09-29:
 * "no tiene caso ver cosas que ya conoces en descubrir"): a title the viewer
 * already has a `user_item` for — saved, marked, anything — never appears in
 * Descubrir. `NOT EXISTS` on the `(user_id, catalog_item_id)` unique index,
 * to drop INSIDE the query next to whatever gates it already carries.
 *
 * `catalogItemIdCol` is the outer query's catalog id (`catalog_item.id`,
 * `backlog_item.catalog_item_id`, `user_item.catalog_item_id`…). The inner
 * `user_item` is aliased so it never collides with an outer `user_item`.
 */
export function notInLibrary(viewerId: string, catalogItemIdCol: AnyPgColumn): SQL {
  return sql`not exists (select 1 from ${userItems} as "lib" where "lib"."user_id" = ${viewerId} and "lib"."catalog_item_id" = ${catalogItemIdCol})`;
}

import { getTableName, is, Column, sql, type AnyColumn, type SQL } from "drizzle-orm";

/**
 * Colecciones de fiesta — the predicates the GENERIC collection code uses to
 * keep party collections out of its reads and writes.
 *
 * A party is a `backlog` (owner = host) whose id has a `party` row. It holds
 * only songs (`track`), has guests, and is always private. None of the
 * generic collection surfaces can show it correctly (no `user_item` behind its
 * songs, other people's songs inside), and none must be able to WRITE into
 * it (a film in a party, a song in a normal collection). So:
 *   - owner-side enumerations (Colecciones carousel, pickers "guardar en",
 *     `GET /collections`, stats) filter with `notPartyBacklog(backlogs.id)`;
 *   - the generic membership writes probe `isPartyBacklogSql` and refuse.
 * Parties are listed and read ONLY through `modules/party-collections`.
 */

/**
 * A column ALWAYS rendered as `"table"."column"`. Drizzle renders `${col}` as
 * a bare `"id"` in a one-table select, and a bare name inside the correlated
 * subqueries below would bind to the INNER table if it ever had a column of
 * that name (learning 2026-09-27-columna-sin-calificar-en-subquery-
 * correlacionada). Most callers here are one-table selects on `backlog`.
 */
function qualified(col: AnyColumn | SQL): SQL {
  if (is(col, Column)) {
    return sql`${sql.identifier(getTableName(col.table))}.${sql.identifier(col.name)}`;
  }
  return sql`${col}`;
}

/** `NOT EXISTS (party for this backlog)`. */
export function notPartyBacklog(backlogIdCol: AnyColumn | SQL): SQL {
  return sql`not exists (select 1 from "party" p where p.backlog_id = ${qualified(backlogIdCol)})`;
}

/** `EXISTS (party for this backlog)` as a boolean expression. */
export function isPartyBacklogSql(backlogIdCol: AnyColumn | SQL): SQL<boolean> {
  return sql<boolean>`exists (select 1 from "party" p where p.backlog_id = ${qualified(backlogIdCol)})`;
}

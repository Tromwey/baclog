import "server-only";
import { eq, inArray, sql, type SQL } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { db } from "@/db";
import { users } from "@/db/schema";
import { identityScrubStatements } from "./scrub";
import { STATUS_RANK } from "./merge-coverage";

export { MERGE_COVERAGE, STATUS_RANK, mergedStatus } from "./merge-coverage";

/**
 * Phase 4g — fuse account O (SOURCE, absorbed and deleted) into account D
 * (DESTINATION, the bearer's, which stays). The caller has ALREADY proven
 * ownership of O (a consumed mergeToken, `src/authz/merge-token.ts`) and
 * refused minors; this function only moves data.
 *
 * ONE `db.batch` = one transaction on the Neon HTTP driver, with NO
 * interactive reads between statements — so everything is set-based SQL
 * (`UPDATE … WHERE NOT EXISTS`, `UPDATE … FROM`, `INSERT … SELECT … ON
 * CONFLICT`, `DELETE`), ordered so each statement sees the previous ones.
 * Any failure rolls the whole thing back: a merge is all or nothing.
 *
 * What happens to EVERY user-referencing table — move / merge / cascade /
 * scrub — is the `MERGE_COVERAGE` map (merge-coverage.ts, re-exported here),
 * enforced by `scripts/check-merge-coverage.ts`:
 *
 * | table                     | action        | rule                                                           |
 * |---------------------------|---------------|----------------------------------------------------------------|
 * | user                      | identity      | D intact; is_founder OR, founder_rank lower; O deleted last    |
 * | account                   | move          | links move (Apple refresh tokens too, NOT revoked)             |
 * | backlog · backlog_item    | move          | no unique name → no suffix; a private O's shelves arrive Privado |
 * | user_item                 | merge         | collision: more advanced status, verdict D??O, obsessed OR…    |
 * | item_review               | merge         | collision: D's wins, O's deleted (+ its reports); hidden kept  |
 * | user_follow · user_block  | merge         | both directions (incoming follows only to a public D), no dupes, no self-edge; blocked follows gone |
 * | user_avatar               | merge         | only if D has no photo                                         |
 * | report                    | merge         | O↔D reports deleted; reporter/target/resolver O → D            |
 * | release_notice            | merge         | moved unless D has the same claim                              |
 * | cross_media_rec_usage     | merge         | generations ADDED into D's month                               |
 * | cross_media_rec_seen      | merge         | collision: earlier seen_at, dismissal kept                     |
 * | cross_media_reco_feedback | merge         | follows its user_item                                          |
 * | analytics_event           | move + scrub  | user_id → D; O's handle nulled                                 |
 * | waitlist_entry            | scrub         | O's entry deleted (as deleteAccount)                           |
 * | verificationToken         | scrub         | O's live codes deleted (as deleteAccount)                      |
 * | session · mobile_session · device_token · follow_push_notice · recap_send | cascade | die with O |
 *
 * NOT `deleteAccount` for O on purpose: that would revoke O's Apple link,
 * which now belongs to D. It runs the SAME scrubs (`identityScrubStatements`)
 * right before deleting O's row, which is what AGENTS.md requires of every
 * path that makes an account disappear.
 *
 * Guard: the batch starts by locking both `user` rows and dividing by zero
 * unless both exist and neither is a minor — a race (O deleted, someone
 * blocked as a minor) between the caller's checks and the batch aborts the
 * whole transaction instead of merging into or out of a gone/blocked row.
 * That abort surfaces as `MergeRaceError`.
 */

export class MergeRaceError extends Error {
  constructor(cause: unknown) {
    super("mergeAccounts: guard failed (account gone or blocked mid-merge)");
    this.name = "MergeRaceError";
    this.cause = cause;
  }
}

/** Postgres `division_by_zero` — only the guard statement can raise it. */
const GUARD_SQLSTATE = "22012";

function sqlStateOf(err: unknown): string | null {
  for (let e: unknown = err, i = 0; e && i < 4; e = (e as { cause?: unknown }).cause, i++) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
  }
  return null;
}

/** `case <col> when 'completed' then 2 … end` from STATUS_RANK — the ONE
 *  documented order (merge-coverage.ts), never a second copy in SQL. */
function statusRankSql(col: string): SQL {
  const arms = Object.entries(STATUS_RANK)
    .map(([status, rank]) => `when '${status}' then ${rank}`)
    .join(" ");
  return sql.raw(`(case ${col} ${arms} else 0 end)`);
}

export async function mergeAccounts(destinationId: string, sourceId: string): Promise<void> {
  if (destinationId === sourceId) throw new Error("mergeAccounts: source === destination");
  // Tables named literally (quoted) so the SQL reads as SQL; the coverage
  // guardrail greps this file for every table it says is moved/merged.
  const D = sql`${destinationId}::text`;
  const O = sql`${sourceId}::text`;
  const rankO = statusRankSql("o.status");
  const rankD = statusRankSql("d.status");

  const statements: [BatchItem<"pg">, ...BatchItem<"pg">[]] = [
    // ---- guard ----
    db.execute(sql`select id from "user" where id in (${D}, ${O}) order by id for update`),
    db.execute(sql`select 1 / (
      select case when count(*) = 2 then 1 else 0 end
      from "user" where id in (${D}, ${O}) and is_minor = false
    ) as ok`),

    // ---- account: provider links move ----
    db.execute(sql`update "account" set user_id = ${D} where user_id = ${O}`),

    // ---- collections + memberships move ----
    // A PRIVATE source (not public, or no handle) never had its shelves on
    // view: they arrive Privado, so absorbing into a public destination
    // doesn't publish them (per-title activity still follows D's
    // visibility — the app warns with `MergeSource.isPublic`).
    db.execute(sql`update "backlog" set is_public = false, show_on_profile = false
      where user_id = ${O}
        and exists (select 1 from "user" where id = ${O} and not (is_public and username is not null))`),
    db.execute(sql`update "backlog" set user_id = ${D} where user_id = ${O}`),
    db.execute(sql`update "backlog_item" set user_id = ${D} where user_id = ${O}`),

    // ---- user_item: collisions absorbed into D's row, the rest re-keyed ----
    db.execute(sql`update "user_item" as d set
        status = case when ${rankO} > ${rankD} then o.status else d.status end,
        status_changed_at = case when ${rankO} > ${rankD} then o.status_changed_at else d.status_changed_at end,
        verdict = coalesce(d.verdict, o.verdict),
        verdict_changed_at = case when d.verdict is not null then d.verdict_changed_at else o.verdict_changed_at end,
        obsessed = d.obsessed or o.obsessed,
        obsessed_at = case
          when d.obsessed and o.obsessed then least(d.obsessed_at, o.obsessed_at)
          when o.obsessed then o.obsessed_at
          else d.obsessed_at end,
        source_cross_media_rec_id = coalesce(d.source_cross_media_rec_id, o.source_cross_media_rec_id),
        added_at = least(d.added_at, o.added_at)
      from "user_item" as o
      where d.user_id = ${D} and o.user_id = ${O} and o.catalog_item_id = d.catalog_item_id`),
    // O's "why" feedback on a collided title moves onto D's row when D has
    // none and it is about the provenance D's row ended up with.
    db.execute(sql`update "cross_media_reco_feedback" as f
        set user_item_id = d.id, user_id = ${D}, updated_at = now()
      from "user_item" as o, "user_item" as d
      where f.user_item_id = o.id and o.user_id = ${O}
        and d.user_id = ${D} and d.catalog_item_id = o.catalog_item_id
        and f.cross_media_rec_id = d.source_cross_media_rec_id
        and not exists (select 1 from "cross_media_reco_feedback" f2 where f2.user_item_id = d.id)`),
    db.execute(sql`delete from "user_item" as o
      where o.user_id = ${O}
        and exists (select 1 from "user_item" d where d.user_id = ${D} and d.catalog_item_id = o.catalog_item_id)`),
    db.execute(sql`update "user_item" set user_id = ${D} where user_id = ${O}`),
    db.execute(sql`update "cross_media_reco_feedback" set user_id = ${D} where user_id = ${O}`),

    // ---- item_review: D's wins a collision; hidden_at untouched ----
    db.execute(sql`delete from "item_review" as o
      where o.user_id = ${O}
        and exists (select 1 from "item_review" d where d.user_id = ${D} and d.catalog_item_id = o.catalog_item_id)`),
    db.execute(sql`update "item_review" set user_id = ${D} where user_id = ${O}`),
    db.execute(sql`update "item_review" set hidden_by_user_id = ${D} where hidden_by_user_id = ${O}`),

    // ---- user_block (before follows: the follow cleanup reads the result) ----
    db.execute(sql`update "user_block" as b set blocker_user_id = ${D}
      where b.blocker_user_id = ${O} and b.blocked_user_id <> ${D}
        and not exists (select 1 from "user_block" x where x.blocker_user_id = ${D} and x.blocked_user_id = b.blocked_user_id)`),
    db.execute(sql`update "user_block" as b set blocked_user_id = ${D}
      where b.blocked_user_id = ${O} and b.blocker_user_id <> ${D}
        and not exists (select 1 from "user_block" x where x.blocker_user_id = b.blocker_user_id and x.blocked_user_id = ${D})`),

    // ---- user_follow: both directions, no duplicates, no D→D ----
    db.execute(sql`update "user_follow" as f set follower_user_id = ${D}
      where f.follower_user_id = ${O} and f.followed_user_id <> ${D}
        and not exists (select 1 from "user_follow" x where x.follower_user_id = ${D} and x.followed_user_id = f.followed_user_id)`),
    // Incoming follows (X→O ⇒ X→D) only toward a PUBLIC destination with a
    // handle: follows are only ever created toward public profiles, and the
    // follower's own "siguiendo" list doesn't re-gate isPublic, so re-pointing
    // to a private D would list D's handle/name there. Otherwise they stay on
    // O and cascade away with it.
    db.execute(sql`update "user_follow" as f set followed_user_id = ${D}
      where f.followed_user_id = ${O} and f.follower_user_id <> ${D}
        and exists (select 1 from "user" where id = ${D} and is_public and username is not null)
        and not exists (select 1 from "user_follow" x where x.follower_user_id = f.follower_user_id and x.followed_user_id = ${D})`),
    // A block in either direction and a follow can't coexist (blockUser
    // deletes both edges): drop any D↔X edge where D↔X is now blocked.
    db.execute(sql`delete from "user_follow" as f
      where (f.follower_user_id = ${D} or f.followed_user_id = ${D})
        and exists (select 1 from "user_block" b
          where (b.blocker_user_id = f.follower_user_id and b.blocked_user_id = f.followed_user_id)
             or (b.blocker_user_id = f.followed_user_id and b.blocked_user_id = f.follower_user_id))`),

    // ---- user_avatar + users.image: O's photo only if D has none ----
    db.execute(sql`update "user" set image = (select image from "user" where id = ${O})
      where id = ${D}
        and not exists (select 1 from "user_avatar" where user_id = ${D})
        and exists (select 1 from "user_avatar" where user_id = ${O})
        and (select image from "user" where id = ${O}) is not null`),
    // Moves only when D's pointer now names O's photo (so a D with a stray
    // image and no row never ends up pointing at a key it doesn't own).
    db.execute(sql`update "user_avatar" as a set user_id = ${D}
      where a.user_id = ${O}
        and not exists (select 1 from "user_avatar" where user_id = ${D})
        and (select image from "user" where id = ${D}) = '/api/avatar/' || a.key`),

    // ---- report ----
    db.execute(sql`delete from "report"
      where (reporter_user_id = ${O} and target_user_id = ${D})
         or (reporter_user_id = ${D} and target_user_id = ${O})`),
    db.execute(sql`update "report" set reporter_user_id = ${D} where reporter_user_id = ${O}`),
    db.execute(sql`update "report" set target_user_id = ${D} where target_user_id = ${O}`),
    db.execute(sql`update "report" set resolved_by_user_id = ${D} where resolved_by_user_id = ${O}`),

    // ---- release_notice: keep "already told" claims ----
    db.execute(sql`update "release_notice" as r set user_id = ${D}
      where r.user_id = ${O}
        and not exists (select 1 from "release_notice" x where x.user_id = ${D} and x.catalog_item_id = r.catalog_item_id)`),

    // ---- cross_media_rec_usage: the meter adds up, never resets ----
    db.execute(sql`insert into "cross_media_rec_usage"
        (id, user_id, era_key, generations, spent_no_match, created_at, updated_at)
      select gen_random_uuid()::text, ${D}, era_key, generations, spent_no_match, created_at, now()
      from "cross_media_rec_usage" where user_id = ${O}
      on conflict (user_id, era_key) do update set
        generations = "cross_media_rec_usage".generations + excluded.generations,
        spent_no_match = "cross_media_rec_usage".spent_no_match + excluded.spent_no_match,
        updated_at = now()`),

    // ---- cross_media_rec_seen: a dismissal is never lost ----
    db.execute(sql`update "cross_media_rec_seen" as d set
        seen_at = least(d.seen_at, o.seen_at),
        dismissed_at = coalesce(d.dismissed_at, o.dismissed_at)
      from "cross_media_rec_seen" as o
      where d.user_id = ${D} and o.user_id = ${O} and o.cross_media_rec_id = d.cross_media_rec_id`),
    db.execute(sql`update "cross_media_rec_seen" as s set user_id = ${D}
      where s.user_id = ${O}
        and not exists (select 1 from "cross_media_rec_seen" x where x.user_id = ${D} and x.cross_media_rec_id = s.cross_media_rec_id)`),

    // ---- analytics_event: the actor moves (the handle is scrubbed below) ----
    db.execute(sql`update "analytics_event" set user_id = ${D} where user_id = ${O}`),

    // ---- user: the founder badge follows the person ----
    db.execute(sql`update "user" as d set
        is_founder = d.is_founder or o.is_founder,
        founder_rank = least(d.founder_rank, o.founder_rank)
      from "user" as o
      where d.id = ${D} and o.id = ${O}`),

    // ---- O's email/handle out of text columns (same as deleteAccount) ----
    ...identityScrubStatements(sourceId),

    // ---- O goes; session / mobile_session / device_token /
    //      follow_push_notice / recap_send and every leftover cascade ----
    db.delete(users).where(eq(users.id, sourceId)),
  ];

  try {
    await db.batch(statements);
  } catch (err) {
    if (sqlStateOf(err) === GUARD_SQLSTATE) throw new MergeRaceError(err);
    throw err;
  }
  console.log(`[account/merge] ${JSON.stringify({ destinationId, sourceId })}`);
}

/** What the app shows before confirming (`MergeSource` on the wire). The
 *  caller proved it owns this account, so its email is shown. */
export interface MergeSourceSummary {
  handle: string | null;
  name: string | null;
  email: string;
  /** The source was PUBLICLY visible (`isPublic` AND a handle). When false,
   *  its per-title activity and reviews become visible under a public
   *  destination after the merge — the app warns (its shelves arrive
   *  Privado either way). */
  isPublic: boolean;
  counts: {
    titles: number;
    collections: number;
    reviews: number;
    followers: number;
    following: number;
  };
}

export async function getMergeSource(sourceId: string): Promise<MergeSourceSummary | null> {
  const [row] = await db
    .select({
      handle: users.username,
      name: users.name,
      email: users.email,
      isPublic: sql<boolean>`(${users.isPublic} and ${users.username} is not null)`,
      titles: sql<number>`(select count(*)::int from "user_item" where user_id = ${users.id})`,
      collections: sql<number>`(select count(*)::int from "backlog" where user_id = ${users.id})`,
      reviews: sql<number>`(select count(*)::int from "item_review" where user_id = ${users.id})`,
      followers: sql<number>`(select count(*)::int from "user_follow" where followed_user_id = ${users.id})`,
      following: sql<number>`(select count(*)::int from "user_follow" where follower_user_id = ${users.id})`,
    })
    .from(users)
    .where(eq(users.id, sourceId))
    .limit(1);
  if (!row) return null;
  return {
    handle: row.handle,
    name: row.name,
    email: row.email,
    isPublic: Boolean(row.isPublic),
    counts: {
      titles: Number(row.titles),
      collections: Number(row.collections),
      reviews: Number(row.reviews),
      followers: Number(row.followers),
      following: Number(row.following),
    },
  };
}

/** Both accounts' existence and minor flag, for the handler's pre-checks
 *  (the batch guard re-checks inside the transaction). */
export async function mergeParties(
  destinationId: string,
  sourceId: string,
): Promise<{ destination: { isMinor: boolean } | null; source: { isMinor: boolean } | null }> {
  const rows = await db
    .select({ id: users.id, isMinor: users.isMinor })
    .from(users)
    .where(inArray(users.id, [destinationId, sourceId]));
  const find = (id: string) => {
    const r = rows.find((x) => x.id === id);
    return r ? { isMinor: r.isMinor } : null;
  };
  return { destination: find(destinationId), source: find(sourceId) };
}

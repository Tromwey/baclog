/**
 * Phase 4g — the COMPLETE inventory of what `mergeAccounts` (merge.ts) does
 * with every table that references a user, by FK or by storing a user's
 * email/handle as text. PURE on purpose (no `server-only`, no DB): the
 * guardrail `scripts/check-merge-coverage.ts` imports it under tsx, walks the
 * Drizzle schema, and FAILS if a table with a user-referencing column is
 * missing here (or listed here but gone from the schema). Adding a table that
 * points at `user` therefore breaks the check until someone decides — and
 * writes down — what a merge does with it.
 *
 * O = source (absorbed, deleted at the end) · D = destination (the bearer's
 * account, which stays). Actions:
 *   identity — the `user` row itself (D's identity kept; O deleted last).
 *   move     — O's rows are re-keyed to D (no uniqueness can collide).
 *   merge    — re-keyed to D, with an explicit rule for rows that collide
 *              with one D already has.
 *   cascade  — deliberately NOT moved: dies with O's `user` row (FK cascade /
 *              set null).
 *   scrub    — O's email/handle stored as text is removed by the shared
 *              `identityScrubStatements` (scrub.ts), same as `deleteAccount`.
 */
import type { itemStatusEnum } from "../../db/schema";

export type MergeAction = "identity" | "move" | "merge" | "cascade" | "scrub";

export interface MergeCoverageEntry {
  /** One or more, e.g. `analytics_event` moves `user_id` AND scrubs the handle. */
  actions: readonly MergeAction[];
  note: string;
}

/** Keyed by the SQL table name (what `getTableConfig(t).name` returns). */
export const MERGE_COVERAGE: Record<string, MergeCoverageEntry> = {
  user: {
    actions: ["identity"],
    note: "D keeps email, username, name, birthYear, isPublic, isAdmin, token_version, image (unless it had none: see user_avatar). is_founder = D OR O, founder_rank = the lower of both (a cohort badge, not a role). O is deleted LAST in the batch.",
  },
  verificationToken: {
    actions: ["scrub"],
    note: "O's live login code (identifier = email) and merge codes asked by/for O are deleted (shared scrub). merge-token rows carry no email; the consumed one is already gone.",
  },
  session: {
    actions: ["cascade"],
    note: "Auth.js DB sessions of O die with it (O's sessions must end).",
  },
  account: {
    actions: ["move"],
    note: "Apple/Google links move to D (PK is (provider, sub): never collides; D may end with two subs of one provider). Apple refresh tokens travel with the row — NOT revoked.",
  },
  backlog: {
    actions: ["move"],
    note: "Collections move to D (no unique name/slug constraint exists, so no suffixing). If O was not publicly visible (private or no handle) its collections are set Privado (is_public = show_on_profile = false) first, so absorbing them into a public D publishes nothing that was hidden.",
  },
  backlog_item: {
    actions: ["move"],
    note: "Memberships follow their collections (user_id re-keyed; unique is per backlog, unaffected).",
  },
  user_item: {
    actions: ["merge"],
    note: "No collision → re-keyed. Collision (D, catalogItemId) → D's row absorbs: more advanced status (STATUS_RANK) with its status_changed_at (tie keeps D), verdict D ?? O, obsessed OR with the older obsessed_at, source rec D ?? O, added_at = the earlier. Then O's row is deleted.",
  },
  item_review: {
    actions: ["merge"],
    note: "No collision → moved to D. Collision → D's kept, O's deleted (its reports cascade). hidden_at kept as is. hidden_by_user_id = O → D.",
  },
  user_follow: {
    actions: ["merge"],
    note: "O→X becomes D→X; X→O becomes X→D ONLY when D is public with a handle (else they cascade with O: a follower's list would otherwise name a private D). Duplicates and D↔D skipped; O↔D edges cascade. Afterwards every follow edge between D and someone D blocks / is blocked by (either direction) is deleted, as blockUser would.",
  },
  user_block: {
    actions: ["merge"],
    note: "Same as follows, both directions, no duplicates, no self-block; O↔D blocks cascade.",
  },
  mobile_session: {
    actions: ["cascade"],
    note: "O's app sessions die: its bearers are 401 by the per-request re-read.",
  },
  device_token: {
    actions: ["cascade"],
    note: "APNs tokens of O's sessions die with them (a phone signed into O stops getting pushes).",
  },
  follow_push_notice: {
    actions: ["cascade"],
    note: "Push throttle only; a merge never sends a follow push.",
  },
  user_avatar: {
    actions: ["merge"],
    note: "Moved to D (and users.image re-pointed) only when D has no photo; otherwise O's cascades.",
  },
  report: {
    actions: ["merge"],
    note: "Reports between O and D (either way) are deleted — same person now. reporter/target/resolved_by = O → D (moderation history follows the person). Reports on O's reviews deleted by a collision cascade with them.",
  },
  waitlist_entry: {
    actions: ["scrub"],
    note: "O's entry (by email or converted_user_id) is deleted by the shared scrub; referrals cascade.",
  },
  recap_send: {
    actions: ["cascade"],
    note: "Idempotency claims for O's email; D's own claims already govern D's mail.",
  },
  release_notice: {
    actions: ["merge"],
    note: "Moved to D unless D has the same (user, title) claim — keeps D from being mailed again about a title O was already told about.",
  },
  cross_media_rec_usage: {
    actions: ["merge"],
    note: "Monthly LLM meter: O's generations/spent_no_match are ADDED to D's row for the same month (upsert), so merging never resets a quota.",
  },
  cross_media_rec_seen: {
    actions: ["merge"],
    note: "Moved to D; on collision D's row keeps the earlier seen_at and D ?? O dismissed_at (a × is never lost).",
  },
  cross_media_reco_feedback: {
    actions: ["merge"],
    note: "Follows its user_item: re-keyed rows keep it (user_id → D). For a collided user_item, O's feedback moves onto D's row only if D's has none and the rec matches D's final provenance; else it cascades with O's user_item.",
  },
  analytics_event: {
    actions: ["move", "scrub"],
    note: "user_id O → D (O's sessions were D's person). target_username = O's handle is nulled by the shared scrub, as on deletion.",
  },
};

/**
 * "More advanced" for `item_status` (db/schema.ts itemStatusEnum):
 * on_my_radar < in_progress < completed. `custom` is deprecated and was
 * folded into `in_progress` in migration 0009, so it ranks the same.
 * A value added to the enum and missing here is a compile error (the
 * `satisfies`); merge.ts builds its SQL CASE from THIS map.
 */
export const STATUS_RANK = {
  on_my_radar: 0,
  in_progress: 1,
  custom: 1,
  completed: 2,
} as const satisfies Record<(typeof itemStatusEnum.enumValues)[number], number>;

export type ItemStatus = keyof typeof STATUS_RANK;

/** The status a collided user_item keeps: strictly more advanced wins; a
 *  tie keeps the destination's. */
export function mergedStatus(destination: ItemStatus, source: ItemStatus): "destination" | "source" {
  return STATUS_RANK[source] > STATUS_RANK[destination] ? "source" : "destination";
}

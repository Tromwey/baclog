import "server-only";
import { and, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { FOLLOW_LISTS_VISIBILITY, preferredServiceEnum, users } from "@/db/schema";

/**
 * Editable account fields — the ONE write path behind the web's
 * `updateDisplayNameAction` / `setPreferredServiceAction` /
 * `setNotifyReleasesAction` / `setNotifyRecapAction` / `setPublicAction` /
 * `setFollowListsVisibilityAction` and
 * the API's `PATCH /me`.
 *
 * Takes a `userId` on purpose, so it must NEVER live in a "use server" file
 * (see the note in modules/backlog/membership.ts): callers derive the id via
 * `assertUser()` (actions) or the bearer (`withApi`) first. No `next/cache`
 * here — the actions revalidate what they render; the API has nothing cached.
 */

export const displayNameSchema = z.string().trim().min(1).max(50);

/** Validated against the Drizzle enum, never a hand-typed list. */
export const preferredServiceSchema = z.enum(preferredServiceEnum.enumValues);
export type PreferredService = z.infer<typeof preferredServiceSchema>;

/** Who reads your followers / following lists (migration 0031). Validated
 *  against the schema's constant, never a hand-typed list. */
export const followListsVisibilitySchema = z.enum(FOLLOW_LISTS_VISIBILITY);

export const profilePatchSchema = z.object({
  name: displayNameSchema.optional(),
  preferredService: preferredServiceSchema.optional(),
  notifyReleases: z.boolean().optional(),
  /** Phase 4b — the monthly recap email's opt-out (`api/cron/recap`). */
  notifyRecap: z.boolean().optional(),
  /** Phase 4e — the "@x te sigue" push opt-out (the web has no toggle). */
  notifyFollowers: z.boolean().optional(),
  isPublic: z.boolean().optional(),
  /** 2026-09-27 — `public` · `mutuals` · `private` (follow-lists-policy.ts). */
  followListsVisibility: followListsVisibilitySchema.optional(),
});
export type ProfilePatch = z.infer<typeof profilePatchSchema>;

export type UpdateProfileResult =
  | { ok: true }
  | { ok: false; error: "onboarding_required" };

/**
 * Applies the given fields (only the ones present) to the caller's own row.
 * An empty patch is a no-op, not an error. `isPublic` is the privacy switch:
 * every public read re-gates on it at query time, so flipping it here is
 * immediate everywhere (the setPublicAction posture).
 *
 * F2.2 age gate, enforced HERE (the one write path, web and API): a `name`
 * and `isPublic: true` are only written to a row that already has a birth
 * year. `name` is what marks an account as onboarded and `isPublic` is what
 * publishes it — writable on their own, they let a fresh account skip
 * `completeOnboarding` (and its under-13 block) entirely. The condition is
 * in the UPDATE's WHERE, not a prior read: no window, and when it fails
 * NOTHING in the patch is written (`onboarding_required`). The legitimate
 * first name comes from `completeOnboarding`, which writes name + birth year
 * together. Making an account private is never gated.
 */
export async function updateProfile(
  userId: string,
  patch: ProfilePatch,
): Promise<UpdateProfileResult> {
  const set: Partial<typeof users.$inferInsert> = {};
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.preferredService !== undefined) set.preferredService = patch.preferredService;
  if (patch.notifyReleases !== undefined) set.notifyReleases = Boolean(patch.notifyReleases);
  if (patch.notifyRecap !== undefined) set.notifyRecap = Boolean(patch.notifyRecap);
  if (patch.isPublic !== undefined) set.isPublic = Boolean(patch.isPublic);
  // Takes effect on the next read: every list read resolves access at query
  // time (getFollowListsAccess) — nothing cached to invalidate.
  if (patch.followListsVisibility !== undefined) {
    set.followListsVisibility = patch.followListsVisibility;
  }
  const needsAgeGate = patch.name !== undefined || patch.isPublic === true;
  if (Object.keys(set).length > 0) {
    const written = await db
      .update(users)
      .set(set)
      .where(
        needsAgeGate
          ? and(eq(users.id, userId), isNotNull(users.birthYear))
          : eq(users.id, userId),
      )
      .returning({ id: users.id });
    if (needsAgeGate && written.length === 0) {
      return { ok: false, error: "onboarding_required" };
    }
  }
  if (patch.notifyFollowers !== undefined) {
    await db
      .update(users)
      .set({ notifyFollowers: patch.notifyFollowers })
      .where(eq(users.id, userId));
  }
  return { ok: true };
}

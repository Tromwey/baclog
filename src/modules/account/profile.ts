import "server-only";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { preferredServiceEnum, users } from "@/db/schema";
import { MIGRATION_0029_LIVE } from "@/auth/live-0029";

/**
 * Editable account fields — the ONE write path behind the web's
 * `updateDisplayNameAction` / `setPreferredServiceAction` /
 * `setNotifyReleasesAction` / `setNotifyRecapAction` / `setPublicAction` and
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

export const profilePatchSchema = z.object({
  name: displayNameSchema.optional(),
  preferredService: preferredServiceSchema.optional(),
  notifyReleases: z.boolean().optional(),
  /** Phase 4b — the monthly recap email's opt-out (`api/cron/recap`). */
  notifyRecap: z.boolean().optional(),
  /** Phase 4e — the "@x te sigue" push opt-out. Only writable once migration
   *  0029 is live (`PATCH /me` answers 503 before; the web has no toggle). */
  notifyFollowers: z.boolean().optional(),
  isPublic: z.boolean().optional(),
});
export type ProfilePatch = z.infer<typeof profilePatchSchema>;

/**
 * Applies the given fields (only the ones present) to the caller's own row.
 * An empty patch is a no-op, not an error. `isPublic` is the privacy switch:
 * every public read re-gates on it at query time, so flipping it here is
 * immediate everywhere (the setPublicAction posture).
 */
export async function updateProfile(
  userId: string,
  patch: ProfilePatch,
): Promise<void> {
  const set: Partial<typeof users.$inferInsert> = {};
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.preferredService !== undefined) set.preferredService = patch.preferredService;
  if (patch.notifyReleases !== undefined) set.notifyReleases = Boolean(patch.notifyReleases);
  if (patch.notifyRecap !== undefined) set.notifyRecap = Boolean(patch.notifyRecap);
  if (patch.isPublic !== undefined) set.isPublic = Boolean(patch.isPublic);
  if (Object.keys(set).length > 0) {
    await db.update(users).set(set).where(eq(users.id, userId));
  }
  // Raw SQL: the column is commented out in schema.ts until migration 0029
  // is applied (declaring it early breaks every insert(users)). Skipped
  // while the switch is off — `PATCH /me` refuses the field with 503 first,
  // and the web has no toggle for it.
  if (MIGRATION_0029_LIVE && patch.notifyFollowers !== undefined) {
    await db.execute(
      sql`update "user" set "notify_followers" = ${Boolean(patch.notifyFollowers)} where "id" = ${userId}`,
    );
  }
}

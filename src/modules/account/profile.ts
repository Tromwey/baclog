import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { preferredServiceEnum, users } from "@/db/schema";

/**
 * Editable account fields — the ONE write path behind the web's
 * `updateDisplayNameAction` / `setPreferredServiceAction` /
 * `setNotifyReleasesAction` / `setPublicAction` and the API's `PATCH /me`.
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
  if (patch.isPublic !== undefined) set.isPublic = Boolean(patch.isPublic);
  if (Object.keys(set).length === 0) return;
  await db.update(users).set(set).where(eq(users.id, userId));
}

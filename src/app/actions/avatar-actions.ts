"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { assertUser } from "@/authz";
import { db } from "@/db";
import { userAvatars, users } from "@/db/schema";
import { AVATAR_MAX_BYTES, avatarUrlOf } from "@/modules/avatar/shared";
import { sniffImageType } from "@/modules/avatar/sniff";

/**
 * F3.11 foto de perfil. The client already cropped and resized (see
 * modules/avatar/client.ts); the server trusts nothing about it: it re-checks
 * the size and sniffs the bytes for one of the three raster types before
 * storing them. Two writes, no transaction (Neon HTTP driver): bytes first,
 * pointer second, so a failure between them leaves the OLD pointer intact —
 * the row it points at is gone (same user_id, new key), and the route 404s
 * until the next upload, which is the safe way round.
 */
export type UploadAvatarResult =
  | { ok: true; url: string }
  | { ok: false; error: "invalid" | "too_large" };

export async function uploadAvatarAction(
  formData: FormData,
): Promise<UploadAvatarResult> {
  const user = await assertUser();
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "invalid" };
  if (file.size === 0 || file.size > AVATAR_MAX_BYTES) {
    return { ok: false, error: "too_large" };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentType = sniffImageType(bytes);
  if (!contentType) return { ok: false, error: "invalid" };

  // A fresh key per upload: the old URL dies with it, so nothing cached under
  // it (browsers hold the response as immutable) can ever show the old photo.
  const key = crypto.randomUUID().replace(/-/g, "");
  await db
    .insert(userAvatars)
    .values({ userId: user.id, key, contentType, bytes })
    .onConflictDoUpdate({
      target: userAvatars.userId,
      set: { key, contentType, bytes, updatedAt: new Date() },
    });
  const url = avatarUrlOf(key);
  await db.update(users).set({ image: url }).where(eq(users.id, user.id));

  revalidateAvatarSurfaces(user.username);
  return { ok: true, url };
}

export async function removeAvatarAction() {
  const user = await assertUser();
  // Pointer first, bytes second: the reverse order would leave a live URL
  // pointing at nothing for the gap between the two writes.
  await db.update(users).set({ image: null }).where(eq(users.id, user.id));
  await db.delete(userAvatars).where(eq(userAvatars.userId, user.id));
  revalidateAvatarSurfaces(user.username);
  return { ok: true as const };
}

/** The pages that render the viewer's own photo; the public tree too, so a
 *  change is immediate for visitors and not whenever its cache expires. */
function revalidateAvatarSurfaces(username: string | null) {
  revalidatePath("/perfil");
  revalidatePath("/settings");
  if (username) revalidatePath(`/u/${username}`, "layout");
}

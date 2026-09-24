import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userAvatars, users } from "@/db/schema";
import { AVATAR_MAX_BYTES, avatarUrlOf } from "./shared";
import { sniffImageType } from "./sniff";

/**
 * F3.11 foto de perfil — the writes behind `uploadAvatarAction` /
 * `removeAvatarAction` (web) and `PUT` / `DELETE /me/avatar` (API). Takes a
 * `userId`: never a "use server" file; the actions revalidate the pages that
 * render the photo, the API has nothing cached.
 *
 * The client already cropped and resized (modules/avatar/client.ts on the
 * web, the app on iOS); the server trusts nothing about it: it re-checks the
 * size and sniffs the bytes for one of the three raster types before storing
 * them (SVG never). Two writes, no transaction (Neon HTTP driver): bytes
 * first, pointer second, so a failure between them leaves the OLD pointer
 * intact — the row it points at is gone (same user_id, new key), and the
 * route 404s until the next upload, which is the safe way round.
 */
export type StoreAvatarResult =
  | { ok: true; url: string }
  | { ok: false; error: "invalid" | "too_large" };

export async function storeAvatar(
  userId: string,
  bytes: Uint8Array,
): Promise<StoreAvatarResult> {
  if (bytes.byteLength === 0) return { ok: false, error: "invalid" };
  if (bytes.byteLength > AVATAR_MAX_BYTES) return { ok: false, error: "too_large" };
  const contentType = sniffImageType(bytes);
  if (!contentType) return { ok: false, error: "invalid" };

  // A fresh key per upload: the old URL dies with it, so nothing cached under
  // it (browsers hold the response as immutable) can ever show the old photo.
  const key = crypto.randomUUID().replace(/-/g, "");
  await db
    .insert(userAvatars)
    .values({ userId, key, contentType, bytes })
    .onConflictDoUpdate({
      target: userAvatars.userId,
      set: { key, contentType, bytes, updatedAt: new Date() },
    });
  const url = avatarUrlOf(key);
  await db.update(users).set({ image: url }).where(eq(users.id, userId));
  return { ok: true, url };
}

/** Pointer first, bytes second: the reverse order would leave a live URL
 *  pointing at nothing for the gap between the two writes. Idempotent. */
export async function removeAvatar(userId: string): Promise<void> {
  await db.update(users).set({ image: null }).where(eq(users.id, userId));
  await db.delete(userAvatars).where(eq(userAvatars.userId, userId));
}

import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userAvatars, users } from "@/db/schema";

/**
 * The bytes behind one avatar URL, with what the route needs to decide
 * whether to serve them: the owner's id and their `isPublic`. The route
 * (api/avatar/[key]) applies the gate — a private user's photo is served to
 * that user only, and a missing key and a refused one are the same 404.
 */
export async function getAvatarByKey(key: string) {
  const [row] = await db
    .select({
      userId: userAvatars.userId,
      contentType: userAvatars.contentType,
      bytes: userAvatars.bytes,
      isPublic: users.isPublic,
    })
    .from(userAvatars)
    .innerJoin(users, eq(users.id, userAvatars.userId))
    .where(eq(userAvatars.key, key))
    .limit(1);
  return row ?? null;
}

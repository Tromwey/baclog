import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

/**
 * F2.4 — deletes the user row; every user-owned table cascades (backlogs,
 * items, user_item, item_review, user_follow both ways, user_avatar,
 * reports-against). catalog_item / media_link are shared cache, not user
 * data. No "why are you leaving" email — just gone. Revocation is implicit:
 * both the cookie session and the mobile bearer re-read `users` per request,
 * so the next call from either is a 401. Takes a `userId`: never a "use
 * server" file; the action signs out + redirects, the API answers 204.
 */
export async function deleteAccount(userId: string): Promise<void> {
  await db.delete(users).where(eq(users.id, userId));
}

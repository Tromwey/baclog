import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { auth } from "./config";

/**
 * The per-request user fetch. Field list is explicit and MUST NOT include
 * birthYear (F2.2: never displayed, never serialized — defense in depth).
 * A deleted account (row gone) or blocked minor resolves to null: the JWT
 * cookie may still exist, but this read is the revocation check.
 */
export const getCurrentUser = cache(async () => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      username: users.username,
      isPublic: users.isPublic,
      preferredService: users.preferredService,
      isMinor: users.isMinor,
      isFounder: users.isFounder,
      founderRank: users.founderRank,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!user || user.isMinor) return null;
  return user;
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/** Page-level gate: redirects to /login when signed out. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

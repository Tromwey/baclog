import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { apiContext } from "@/authz/api-context";
import { auth } from "./config";

/**
 * The per-request user read, by id. Field list is explicit and MUST NOT
 * include birthYear (F2.2: never displayed, never serialized — defense in
 * depth). A deleted account (row gone) or blocked minor resolves to null:
 * the JWT (cookie OR mobile bearer) may still exist, but this read is the
 * revocation check. Shared by the cookie session below and the bearer path
 * (`src/authz/api.ts`) so the two can never disagree on what a user is.
 */
export async function loadUserById(id: string) {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      username: users.username,
      // F3.11 — the viewer's own photo URL (null = ADN orb).
      image: users.image,
      isPublic: users.isPublic,
      notifyReleases: users.notifyReleases,
      preferredService: users.preferredService,
      isMinor: users.isMinor,
      isFounder: users.isFounder,
      founderRank: users.founderRank,
      isAdmin: users.isAdmin,
      // Feature announcements (modules/announcements.ts). Rides along on the
      // per-request user read the JWT-session deviation already pays for, so
      // eligibility costs no extra query anywhere in the app.
      announcementSeen: users.announcementSeen,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!user || user.isMinor) return null;
  return user;
}

/**
 * The per-request user. Two sources, checked in order:
 *
 *  1. The /api/v1 bearer context (`apiContext`, src/authz/api-context.ts):
 *     `withApi` has already verified the token and re-read the row, and runs
 *     the handler inside `apiContext.run({ user })`. Inside that scope this
 *     returns `store.user` and NEVER calls `auth()` — v1 is cookie-free, and
 *     a cookie must not be able to override or leak into a bearer request.
 *  2. Otherwise the Auth.js cookie session (pages, server actions, the
 *     pre-v1 route handlers) — unchanged behaviour.
 */
export const getCurrentUser = cache(async () => {
  const store = apiContext.getStore();
  if (store) return store.user;
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  return loadUserById(id);
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof loadUserById>>>;

/** Page-level gate: redirects to /login when signed out. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

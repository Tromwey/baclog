import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { apiContext } from "@/authz/api-context";
import { auth } from "./config";
import { loadUserById, loadUserWithTokenVersion } from "./user-row";

/** The per-request user read, by id (explicit field list, never
 *  birthYear) — defined in `user-row.ts`, re-exported here so every existing
 *  `@/auth/session` import keeps working. */
export { loadUserById };

/**
 * The per-request user. Two sources, checked in order:
 *
 *  1. The /api/v1 bearer context (`apiContext`, src/authz/api-context.ts):
 *     `withApi` has already verified the token and re-read the row, and runs
 *     the handler inside `apiContext.run({ user })`. Inside that scope this
 *     returns `store.user` and NEVER calls `auth()` — v1 is cookie-free, and
 *     a cookie must not be able to override or leak into a bearer request.
 *  2. Otherwise the Auth.js cookie session (pages, server actions, the
 *     pre-v1 route handlers). Phase 4b: the row re-read also returns
 *     `token_version` (same single query) and the cookie's `tv` must equal
 *     it — after `POST /api/v1/auth/logout` a cookie minted earlier
 *     (including one a bearer → web handoff minted) is treated exactly like
 *     an invalid cookie: signed out. No `tv` (a pre-4b cookie) = 0. While
 *     `TOKEN_VERSION_LIVE` is false both sides are 0 (the pre-4b behaviour).
 */
export const getCurrentUser = cache(async () => {
  const store = apiContext.getStore();
  if (store) return store.user;
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const row = await loadUserWithTokenVersion(id);
  if (!row) return null;
  const tv = typeof session.tv === "number" ? session.tv : 0;
  if (tv !== row.tokenVersion) return null;
  return row.user;
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof loadUserById>>>;

/** Page-level gate: redirects to /login when signed out. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

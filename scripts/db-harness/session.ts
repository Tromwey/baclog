import { apiContext } from "../../src/authz/api-context";
import { loadUserById } from "../../src/auth/user-row";
/**
 * `@/auth/session` for the DB harness. The real one loads Auth.js (and with
 * it Next's client router), which does not run outside Next. This keeps the
 * FIRST of its two sources — the `apiContext` store, exactly as shipped — and
 * answers "signed out" where the real one would read the cookie. Everything
 * downstream (`assertUser`, `assertOwnsBacklog`, the server actions) is the
 * code that ships: a case acts as a user with `apiContext.run({ user }, …)`.
 */
export { loadUserById };
export type CurrentUser = NonNullable<Awaited<ReturnType<typeof loadUserById>>>;
export async function getCurrentUser(): Promise<CurrentUser | null> {
  return apiContext.getStore()?.user ?? null;
}
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("db-harness: requireUser() sin usuario (la real redirige a /login)");
  return user;
}

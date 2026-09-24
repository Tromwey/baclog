import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { CurrentUser } from "@/auth/session";

/**
 * The bearer-request context for /api/v1 (Kura iOS).
 *
 * Every existing authz helper (`assertUser`, `assertOwnsBacklog`,
 * `assertOwnsUserItem`) and several modules resolve the actor through
 * `getCurrentUser()` in `src/auth/session.ts`, which reads the Auth.js
 * cookie. A mobile request carries no cookie — it carries a signed bearer.
 * Rather than threading a user through every module signature, `withApi`
 * (`src/authz/api.ts`) verifies the bearer, re-reads the user row, and runs
 * the handler INSIDE `apiContext.run({ user }, …)`. `getCurrentUser()` checks
 * this store first: inside an API request it returns `store.user` and never
 * touches `auth()`; outside one (pages, actions, the old route handlers) it
 * behaves exactly as before.
 *
 * This lives in its own module (not `api.ts`) so `session.ts` can import it
 * without a cycle: `api.ts` imports `session.ts` for the user loader, and
 * `session.ts` imports this. Node-only (`node:async_hooks`) — the v1 handlers
 * run on the Node runtime, never on the edge.
 */
export interface ApiStore {
  user: CurrentUser;
}

export const apiContext = new AsyncLocalStorage<ApiStore>();

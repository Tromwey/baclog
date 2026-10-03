import "server-only";
import { after } from "next/server";
import { redactedError } from "@/authz/safe-log";

/**
 * Fire-and-forget work that must not delay or break the response (a push, a
 * `last_seen_at` bump, an Apple token exchange). Runs through Next's
 * `after()` — on Vercel the function stays alive until it finishes
 * (`waitUntil`) — and every failure is LOGGED under `label`, never thrown
 * into the request that scheduled it.
 *
 * What is logged is `redactedError(err)` (`src/authz/safe-log.ts`), never the
 * error object: a failed Drizzle statement carries its bound values in
 * `message` and in `.params`, and the tasks scheduled here write things like
 * Apple's refresh token (`saveAppleRefreshToken`, `storeAppleRefreshToken`)
 * and device tokens. Name, code, the message without `params`, and the stack
 * frames — enough to find the statement, nothing of what it carried.
 *
 * Outside a request scope (`after()` throws there: scripts, tests) the task
 * starts immediately instead, still unawaited and still logged — the caller's
 * contract ("scheduled, never blocks, never throws") holds either way.
 */
export function afterResponse(label: string, task: () => Promise<unknown>): void {
  const run = async () => {
    try {
      await task();
    } catch (err) {
      console.error(`[${label}] ${redactedError(err)}`);
    }
  };
  try {
    after(run);
  } catch {
    void run();
  }
}

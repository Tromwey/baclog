import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { prepareAppleRevocation } from "@/auth/social";
import { afterResponse } from "@/lib/after-response";
import { users } from "@/db/schema";
import { identityScrubStatements } from "./scrub";

/**
 * F2.4 — deletes the user row; every user-owned table cascades (backlogs,
 * items, user_item, item_review, user_follow both ways, user_avatar,
 * reports-against). catalog_item / media_link are shared cache, not user
 * data. No "why are you leaving" email — just gone. Revocation is implicit:
 * both the cookie session and the mobile bearer re-read `users` per request,
 * so the next call from either is a 401. Takes a `userId`: never a "use
 * server" file; the action signs out + redirects, the API answers 204.
 *
 * Fase 4b — the tables that hold the user's EMAIL or HANDLE without a FK to
 * `user` (so no cascade reaches them: `waitlist_entry`, `analytics_event.
 * target_username`, `verificationToken`) are scrubbed in the SAME batch (Neon
 * HTTP `batch` = one transaction), BEFORE the user row goes. The statements
 * live in `scrub.ts` (`identityScrubStatements`), shared with
 * `mergeAccounts` so both disappearance paths scrub identically — the
 * details of each scrub are documented there.
 * Identity-free aggregates (`release_notice`, counts) cascade or stay as-is.
 *
 * Phase 4f — Sign in with Apple revocation (App Store 5.1.1(v)): the Apple
 * refresh token lives on the `account` row, which cascades with the user, so
 * it is READ first (`prepareAppleRevocation`) and the revocation call to
 * Apple runs AFTER the rows are gone, scheduled past the response
 * (`afterResponse`): best-effort, logged on failure, and it can never block,
 * delay or undo the deletion. EVERY path that deletes an account must go
 * through this function (AGENTS.md). The one exception is `mergeAccounts`
 * (`merge.ts`, phase 4g): the absorbed source's `account` rows MOVE to the
 * destination and its Apple link stays alive, so nothing is revoked — but it
 * runs the very same `identityScrubStatements` before deleting the row.
 * Sessions and device tokens cascade.
 */
export async function deleteAccount(userId: string): Promise<void> {
  const revokeApple = await prepareAppleRevocation(userId);

  await db.batch([
    ...identityScrubStatements(userId),
    db.delete(users).where(eq(users.id, userId)),
  ]);
  afterResponse("auth/apple revoke", revokeApple);
}

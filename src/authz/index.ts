import "server-only";
import { and, eq } from "drizzle-orm";
import { getCurrentUser, type CurrentUser } from "@/auth/session";
import { db } from "@/db";
import { backlogItems, backlogs } from "@/db/schema";
import { NotFoundError, UnauthorizedError } from "./errors";

export { NotFoundError, UnauthorizedError } from "./errors";

/**
 * THE authorization choke point (ADR-010: authz lives in app code — a
 * missed check is a cross-user leak). Every mutation and every private
 * read of user-owned rows goes through one of these helpers; none of them
 * can return another user's row. Ownership failures surface as NotFound,
 * never Forbidden, so resource existence is never confirmed to outsiders.
 *
 * The ONLY code allowed to query user data without a session is
 * modules/backlog/public.ts (public pages), which gates on isPublic
 * instead.
 */

/** Action-level gate: throws instead of redirecting (for server actions). */
export async function assertUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export async function assertOwnsBacklog(backlogId: string) {
  const user = await assertUser();
  const [backlog] = await db
    .select()
    .from(backlogs)
    .where(and(eq(backlogs.id, backlogId), eq(backlogs.userId, user.id)))
    .limit(1);
  if (!backlog) throw new NotFoundError("Backlog not found");
  return { user, backlog };
}

export async function assertOwnsBacklogItem(backlogItemId: string) {
  const user = await assertUser();
  const [item] = await db
    .select()
    .from(backlogItems)
    .where(
      and(eq(backlogItems.id, backlogItemId), eq(backlogItems.userId, user.id)),
    )
    .limit(1);
  if (!item) throw new NotFoundError("Item not found");
  return { user, item };
}

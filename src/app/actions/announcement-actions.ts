"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, gt } from "drizzle-orm";
import { assertUser } from "@/authz";
import { db } from "@/db";
import { backlogs, catalogItems, users } from "@/db/schema";
import { CURRENT_ANNOUNCEMENT } from "@/modules/announcements";
import {
  getFollowSuggestion,
  type FollowSuggestion,
} from "@/modules/backlog/follow-suggestion";
import { ensureUserItemAndMembership } from "@/modules/backlog/membership";

/**
 * Dismiss the current feature announcement, forever, for this account.
 *
 * The key comes from the SERVER constant, never from the client: an argument
 * here would let a caller stamp any string — including a future release's key,
 * which would silently opt them out of an announcement that doesn't exist yet.
 * There is exactly one dismissible announcement at a time, so the action needs
 * no parameters at all.
 */
export async function dismissAnnouncementAction() {
  const user = await assertUser();
  await db
    .update(users)
    .set({ announcementSeen: CURRENT_ANNOUNCEMENT })
    .where(eq(users.id, user.id));
  revalidatePath("/backlogs", "layout");
  return { ok: true as const };
}

/**
 * Novedades 6b — find a real unreleased album by an artist this user already
 * has. Called from the modal AFTER mount, never during the page render: it can
 * cost several iTunes round-trips, and /backlogs must not wait on them.
 *
 * Returns null when there's nothing to suggest, which the modal treats as
 * "don't appear at all" — an announcement with nothing to demonstrate is the
 * abstract announcement this design exists to avoid.
 */
export async function findFollowSuggestionAction(): Promise<FollowSuggestion | null> {
  const user = await assertUser();
  return getFollowSuggestion(user.id);
}

/**
 * "Seguir" — put the suggested album in the user's newest backlog.
 *
 * Newest, not a picker: the modal's whole point is that one tap leaves them
 * monitoring something. Asking WHERE at that moment trades the payoff for a
 * form. `ensureUserItemAndMembership` is the same choke point every add goes
 * through, so ownership and the user_item/membership split behave identically.
 */
export async function followSuggestionAction(catalogItemId: string) {
  const user = await assertUser();

  // Validate the id BEFORE writing. Authorization is never at stake here (the
  // backlog is resolved server-side from the session), but an unchecked id from
  // the client reaches a foreign-key insert: a nonexistent one throws deep
  // inside the helper and surfaces as a 500 instead of a handled error, and any
  // arbitrary catalog row would turn this into a second "add to my backlog"
  // path that skips palette caching and pre-order date resolution.
  const [album] = await db
    .select({ id: catalogItems.id })
    .from(catalogItems)
    .where(
      and(
        eq(catalogItems.id, catalogItemId),
        eq(catalogItems.mediaType, "album"),
        gt(catalogItems.releaseDate, new Date()),
      ),
    )
    .limit(1);
  if (!album) return { error: "invalid" as const };

  const [target] = await db
    .select({ id: backlogs.id })
    .from(backlogs)
    .where(eq(backlogs.userId, user.id))
    .orderBy(desc(backlogs.createdAt))
    .limit(1);
  // No backlog = nowhere to put it. Can't happen from this modal (it only
  // renders on a /backlogs that already has shelves), but the action is
  // callable on its own and must not invent one.
  if (!target) return { error: "no_backlog" as const };

  await ensureUserItemAndMembership({
    userId: user.id,
    backlogId: target.id,
    catalogItemId,
  });

  revalidatePath("/backlogs", "layout");
  return { ok: true as const, backlogId: target.id };
}

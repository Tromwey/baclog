import "server-only";
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { backlogCollaborators, users } from "@/db/schema";
import type { Collaborator } from "./fan";

/**
 * Colecciones formalizado — the credit line of a collection ("tú y mo",
 * "sofi y mo"). `backlog_collaborator` is a CREDIT, not a permission (see the
 * schema): nothing here grants access to anything.
 *
 * Two readers, two postures:
 *  - `getCollaboratorsForBacklogs` is the OWNER's read — the caller passes
 *    ids of backlogs it already scoped to the session user (getShelvesForUser,
 *    assertOwnsBacklog). It still gates each collaborator's identity on a
 *    public profile with a handle, because the owner's screens show names
 *    that end up on shared cards.
 *  - `getPublicCollaborators` runs inside public.ts' reads (no session): the
 *    caller has already gated the BACKLOG on `users.isPublic` and
 *    `backlogs.isPublic`; each collaborator is gated on the same
 *    `isPublic AND username IS NOT NULL` as any public identity, with the
 *    public field list only.
 *
 * Nobody writes the table yet (the invite flow has no design), so both return
 * empty maps today — every screen renders "solo tú" / the owner alone.
 */

const collaboratorFields = {
  backlogId: backlogCollaborators.backlogId,
  name: users.name,
  username: users.username,
  image: users.image,
};

async function read(backlogIds: readonly string[]): Promise<Map<string, Collaborator[]>> {
  const out = new Map<string, Collaborator[]>();
  if (backlogIds.length === 0) return out;
  const rows = await db
    .select(collaboratorFields)
    .from(backlogCollaborators)
    .innerJoin(users, eq(users.id, backlogCollaborators.userId))
    .where(
      and(
        inArray(backlogCollaborators.backlogId, [...backlogIds]),
        eq(users.isPublic, true),
        isNotNull(users.username),
      ),
    )
    .orderBy(asc(backlogCollaborators.createdAt));
  for (const r of rows) {
    const list = out.get(r.backlogId) ?? [];
    list.push({ name: r.name ?? r.username ?? "", username: r.username, image: r.image });
    out.set(r.backlogId, list);
  }
  return out;
}

/** Owner-side: ids MUST already be scoped to the session user's backlogs. */
export function getCollaboratorsForBacklogs(backlogIds: readonly string[]) {
  return read(backlogIds);
}

/** Public-side: ids MUST come from a public.ts read that gated the backlog. */
export function getPublicCollaborators(backlogIds: readonly string[]) {
  return read(backlogIds);
}

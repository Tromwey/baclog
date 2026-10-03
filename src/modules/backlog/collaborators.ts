import "server-only";
import { and, asc, eq, inArray, isNotNull, isNull, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { backlogCollaborators, users } from "@/db/schema";
import { notBlockedWith } from "@/modules/social/block-gate";
import type { Collaborator } from "./fan";

/**
 * Colecciones formalizado — the credit line of a collection ("tú y mo",
 * "sofi y mo"). `backlog_collaborator` is a CREDIT here, not a permission:
 * nothing in this file grants access to anything.
 *
 * Who writes the table: only colecciones de fiesta (0033) — `joinParty`
 * inserts a guest who entered a PARTY through its link (for a party the row
 * IS its membership, read by `modules/party-collections/access.ts`). The
 * callers of this file only ever pass NORMAL collections (`getShelvesForUser`
 * and the Colecciones pickers exclude parties with `notPartyBacklog`, the
 * zoom redirects a party to /c/{id}, `public.ts` only reads public
 * collections — and a party is always private), so today every screen here
 * still renders "solo tú". The gates below are for the day a normal
 * collection gets a writer.
 *
 * Two readers, two postures:
 *  - `getCollaboratorsForBacklogs(viewerId, ids)` is the OWNER's read — the
 *    caller passes ids of backlogs it already scoped to the session user
 *    (getShelvesForUser, assertOwnsBacklog) and that user as `viewerId`.
 *    Each collaborator's identity is gated on a public profile with a handle
 *    AND on no user block with the viewer in either direction
 *    (`notBlockedWith`, AGENTS.md: a query with a viewer that forgets it is
 *    a security bug), because the owner's screens show names that end up on
 *    shared cards.
 *  - `getPublicCollaborators(ids)` runs inside public.ts' reads (no
 *    session): the caller has already gated the BACKLOG on `users.isPublic`
 *    and `backlogs.isPublic`; each collaborator is gated on the same
 *    `isPublic AND username IS NOT NULL` as any public identity, with the
 *    public field list only.
 * Both drop a party guest the host blocked (`blocked_at`) or who left
 * (`left_at`) — neither is credited.
 */

const collaboratorFields = {
  backlogId: backlogCollaborators.backlogId,
  name: users.name,
  username: users.username,
  image: users.image,
};

async function read(backlogIds: readonly string[], viewerId: string | null): Promise<Map<string, Collaborator[]>> {
  const out = new Map<string, Collaborator[]>();
  if (backlogIds.length === 0) return out;
  const conditions: (SQL | undefined)[] = [
    inArray(backlogCollaborators.backlogId, [...backlogIds]),
    eq(users.isPublic, true),
    isNotNull(users.username),
    viewerId ? notBlockedWith(viewerId, users.id) : undefined,
    isNull(backlogCollaborators.blockedAt),
    isNull(backlogCollaborators.leftAt),
  ];
  const rows = await db
    .select(collaboratorFields)
    .from(backlogCollaborators)
    .innerJoin(users, eq(users.id, backlogCollaborators.userId))
    .where(and(...conditions))
    .orderBy(asc(backlogCollaborators.createdAt));
  for (const r of rows) {
    const list = out.get(r.backlogId) ?? [];
    list.push({ name: r.name ?? r.username ?? "", username: r.username, image: r.image });
    out.set(r.backlogId, list);
  }
  return out;
}

/** Owner-side: ids MUST already be scoped to `viewerId`'s own backlogs, and
 *  `viewerId` is the session user. */
export function getCollaboratorsForBacklogs(viewerId: string, backlogIds: readonly string[]) {
  return read(backlogIds, viewerId);
}

/** Public-side: ids MUST come from a public.ts read that gated the backlog. */
export function getPublicCollaborators(backlogIds: readonly string[]) {
  return read(backlogIds, null);
}

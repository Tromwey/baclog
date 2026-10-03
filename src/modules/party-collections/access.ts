import "server-only";
import { and, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { backlogCollaborators, backlogs, parties } from "@/db/schema";
import { notBlockedWith } from "@/modules/social/block-gate";
import { partyPath } from "./rules";
import type { PartyRole } from "./types";

/**
 * THE party authorization read. A party (backlog with a `party` row) is
 * visible to exactly two kinds of account: its HOST (`backlog.user_id`) and
 * its MEMBERS (a `backlog_collaborator` row — joined through the invite
 * link; a member the host blocked is still a member and still sees it).
 * Everyone else gets null = the same 404 as a nonexistent id (no oracle).
 *
 * A guest who LEFT (`left_at`, only ever set on a blocked guest's row —
 * rules.ts `leaveEffect`) is not a member: null.
 *
 * A USER block (`user_block`, App Store 1.2) in either direction between a
 * guest and the host takes the party away from that guest entirely: null,
 * the same 404 (contract C2 — AGENTS.md: a block is mutual in visibility, and
 * the host's songs/name would otherwise keep reaching someone they blocked).
 * The row stays; lifting the block brings the party back as it was.
 *
 * `blocked` (guests only) = the host's per-party block (`blocked_at`,
 * "Quitar y bloquear"): such a guest keeps SEEING the party, can't add, and
 * may still remove their own songs (C4).
 *
 * `userId` is always the session/bearer user (never from a client).
 */

export interface PartyAccess {
  backlogId: string;
  name: string;
  hostId: string;
  perGuestLimit: number | null;
  createdAt: Date;
  updatedAt: Date;
  role: PartyRole;
  blocked: boolean;
  /** Songs this user put in this party. */
  mineCount: number;
}

export async function getPartyAccess(
  userId: string,
  backlogId: string,
): Promise<PartyAccess | null> {
  const [row] = await db
    .select({
      backlogId: backlogs.id,
      name: backlogs.name,
      hostId: backlogs.userId,
      updatedAt: backlogs.updatedAt,
      perGuestLimit: parties.perGuestLimit,
      createdAt: parties.createdAt,
      memberId: backlogCollaborators.userId,
      blockedAt: backlogCollaborators.blockedAt,
      mineCount: sql<number>`(select count(*)::int from party_song ps where ps.backlog_id = ${backlogs.id} and ps.added_by_user_id = ${userId})`,
    })
    .from(backlogs)
    .innerJoin(parties, eq(parties.backlogId, backlogs.id))
    .leftJoin(
      backlogCollaborators,
      and(
        eq(backlogCollaborators.backlogId, backlogs.id),
        eq(backlogCollaborators.userId, userId),
        isNull(backlogCollaborators.leftAt),
      ),
    )
    .where(
      and(
        eq(backlogs.id, backlogId),
        or(
          eq(backlogs.userId, userId),
          and(isNotNull(backlogCollaborators.userId), notBlockedWith(userId, backlogs.userId)),
        ),
      ),
    )
    .limit(1);
  if (!row) return null;
  const role: PartyRole = row.hostId === userId ? "host" : "guest";
  return {
    backlogId: row.backlogId,
    name: row.name,
    hostId: row.hostId,
    perGuestLimit: row.perGuestLimit,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    role,
    blocked: role === "guest" && row.blockedAt !== null,
    mineCount: Number(row.mineCount) || 0,
  };
}

/**
 * `/backlogs/{id}` (the NORMAL collection zoom) opened on a party: the member
 * page `/c/{id}` if this user may see it, else null (and the zoom answers
 * its usual 404 — a non-member never learns the id is a party).
 */
export async function partyPathForMember(userId: string, backlogId: string): Promise<string | null> {
  const access = await getPartyAccess(userId, backlogId);
  return access ? partyPath(access.backlogId) : null;
}

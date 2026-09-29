import "server-only";
import { and, eq, isNotNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { backlogCollaborators, backlogs, parties } from "@/db/schema";
import { notBlockedWith } from "@/modules/social/block-gate";
import { assertPartyLive } from "./errors";
import type { PartyRole } from "./types";

/**
 * THE party authorization read. A party (backlog with a `party` row) is
 * visible to exactly two kinds of account: its HOST (`backlog.user_id`) and
 * its MEMBERS (a `backlog_collaborator` row — joined through the invite
 * link; a member the host blocked is still a member and still sees it).
 * Everyone else gets null = the same 404 as a nonexistent id (no oracle).
 *
 * `blocked` (guests only) = the host's per-party block (`blocked_at`) OR a
 * user block (`user_block`, App Store 1.2) in either direction with the host:
 * such a guest keeps seeing the party but can't add or remove songs.
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
  assertPartyLive();
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
      userBlocked: sql<boolean>`not ${notBlockedWith(userId, backlogs.userId)}`,
      mineCount: sql<number>`(select count(*)::int from party_song ps where ps.backlog_id = ${backlogs.id} and ps.added_by_user_id = ${userId})`,
    })
    .from(backlogs)
    .innerJoin(parties, eq(parties.backlogId, backlogs.id))
    .leftJoin(
      backlogCollaborators,
      and(eq(backlogCollaborators.backlogId, backlogs.id), eq(backlogCollaborators.userId, userId)),
    )
    .where(
      and(
        eq(backlogs.id, backlogId),
        or(eq(backlogs.userId, userId), isNotNull(backlogCollaborators.userId)),
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
    blocked: role === "guest" && (row.blockedAt !== null || Boolean(row.userBlocked)),
    mineCount: Number(row.mineCount) || 0,
  };
}

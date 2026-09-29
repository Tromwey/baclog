import "server-only";
import type { CurrentUser } from "@/auth/session";
import { getPartyAccess, type PartyAccess } from "@/modules/party-collections/access";
import { assertUser } from "./index";
import { NotFoundError } from "./errors";

/**
 * Colecciones de fiesta — the session gates for the web actions (the API v1
 * uses the bearer user and `getPartyAccess` directly). Same posture as
 * `assertOwnsBacklog`: anything the caller can't see is NotFound, never
 * Forbidden — a party's existence is never confirmed to a non-member.
 *
 *  - `assertPartyMember` → host or member (blocked members included: they
 *    still SEE the party).
 *  - `assertPartyHost`   → the host only (link, limits, blocks, delete).
 *
 * Contribution rules (blocked, cap, duplicates) are NOT gates here: they are
 * outcomes the UI has to draw ("Ya está, la puso @ana", "ya pusiste tus 3"),
 * so the module returns them as results (`addSong`, rules.ts `decideAdd`).
 */

export async function assertPartyMember(
  backlogId: string,
): Promise<{ user: CurrentUser; access: PartyAccess }> {
  const user = await assertUser();
  const access = await getPartyAccess(user.id, backlogId);
  if (!access) throw new NotFoundError("Party not found");
  return { user, access };
}

export async function assertPartyHost(
  backlogId: string,
): Promise<{ user: CurrentUser; access: PartyAccess }> {
  const { user, access } = await assertPartyMember(backlogId);
  if (access.role !== "host") throw new NotFoundError("Party not found");
  return { user, access };
}

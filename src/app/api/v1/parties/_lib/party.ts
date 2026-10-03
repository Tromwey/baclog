import "server-only";
import { ApiError } from "@/authz/api";
import { getPartyDetail } from "@/modules/party-collections/queries";
import { toParty } from "../../_lib/wire";

/**
 * Shared bits of /api/v1/parties/** (colecciones de fiesta). A party the
 * bearer can't see — not a member, not a party, unknown, malformed id — is
 * the SAME 404 everywhere (`parseId` + `getPartyAccess` inside the module).
 */

/** A dead invite link (malformed, unknown, revoked, or blocked with the host). */
export const LINK_DEAD = "Este link ya no funciona. Pide uno nuevo a quien te invitó.";

export const PARTY_NOT_FOUND = "No encontramos esa fiesta. Puede que ya no exista o que no seas parte de ella.";

/** The fresh member view on the wire, or 404. */
export async function partyJson(userId: string, backlogId: string) {
  const party = await getPartyDetail(userId, backlogId);
  if (!party) throw new ApiError("not_found", PARTY_NOT_FOUND);
  return toParty(party);
}

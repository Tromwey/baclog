import { withApi } from "@/authz/api";
import { listPartiesForUser } from "@/modules/party-collections/queries";
import { createParty } from "@/modules/party-collections/write";
import { json, readJson } from "../_lib/http";
import { CreatePartyBodySchema } from "../_lib/schemas";
import { toPartyCard } from "../_lib/wire";
import { partyJson } from "./_lib/party";

/**
 * GET /api/v1/parties → { items: [PartyCard] } — every party the bearer
 * hosts or joined (blocked included), most recently touched first.
 * Parties never appear in `GET /collections`.
 */
export const GET = withApi(async (_req, { user }) => {
  const items = await listPartiesForUser(user.id);
  return json({ items: items.map(toPartyCard) });
});

/**
 * POST /api/v1/parties { name, perGuestLimit? } → 200 Party (host view, with
 * the first invite link active). `perGuestLimit` omitted = 3; null =
 * ilimitadas; 0 = solo ver.
 */
export const POST = withApi(async (request, { user }) => {
  const body = await readJson(request, CreatePartyBodySchema);
  const { backlogId } = await createParty(user.id, body);
  return json(await partyJson(user.id, backlogId));
});

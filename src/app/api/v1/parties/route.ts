import { ApiError, requireOnboarded, withApi } from "@/authz/api";
import { listPartiesForUser } from "@/modules/party-collections/queries";
import { TOO_MANY_PARTIES_MESSAGE } from "@/modules/party-collections/rules";
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
 * ilimitadas; 0 = solo ver. 409 `too_many_parties` when the account already
 * hosts 20 (C7; `message` is the copy). F2.2: a party's name is text other
 * people read (the invite landing shows it to anyone with the link), so it
 * needs a finished onboarding — 403 `onboarding_required`, like joining one.
 */
export const POST = withApi(async (request, { user }) => {
  requireOnboarded(user);
  const body = await readJson(request, CreatePartyBodySchema);
  const res = await createParty(user.id, body);
  if (!res.ok) throw new ApiError("conflict", TOO_MANY_PARTIES_MESSAGE, { reason: "too_many_parties" });
  return json(await partyJson(user.id, res.backlogId));
});

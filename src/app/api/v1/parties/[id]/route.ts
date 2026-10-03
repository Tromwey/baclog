import { ApiError, requireOnboarded, withApi } from "@/authz/api";
import { deleteParty, updateParty } from "@/modules/party-collections/write";
import { json, noContent, parseId, readJson } from "../../_lib/http";
import { UpdatePartyBodySchema } from "../../_lib/schemas";
import { PARTY_NOT_FOUND, partyJson } from "../_lib/party";

/** GET /api/v1/parties/{id} → Party (host or member view). 404 otherwise. */
export const GET = withApi<{ id: string }>(async (_req, { user, params }) => {
  return json(await partyJson(user.id, parseId(params.id)));
});

/**
 * PATCH /api/v1/parties/{id} { name?, perGuestLimit? } → Party. Host only
 * (a guest gets the same 404 as a stranger). Lowering the cap keeps the
 * songs already there. F2.2: 403 `onboarding_required` before the id is
 * looked at (decided on the caller's own row: no oracle).
 */
export const PATCH = withApi<{ id: string }>(async (request, { user, params }) => {
  requireOnboarded(user);
  const id = parseId(params.id);
  const body = await readJson(request, UpdatePartyBodySchema);
  if (!(await updateParty(user.id, id, body))) throw new ApiError("not_found", PARTY_NOT_FOUND);
  return json(await partyJson(user.id, id));
});

/** DELETE /api/v1/parties/{id} → 204. Host only; everything cascades. */
export const DELETE = withApi<{ id: string }>(async (_req, { user, params }) => {
  const id = parseId(params.id);
  if (!(await deleteParty(user.id, id))) throw new ApiError("not_found", PARTY_NOT_FOUND);
  return noContent();
});

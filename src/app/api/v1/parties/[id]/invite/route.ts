import { ApiError, withApi } from "@/authz/api";
import { revokeInvite, rotateInvite } from "@/modules/party-collections/write";
import { json, parseId } from "../../../_lib/http";
import { PARTY_NOT_FOUND, partyJson } from "../../_lib/party";

/**
 * POST /api/v1/parties/{id}/invite → Party. "Crear link nuevo": the active
 * link (if any) stops working and a new one is minted; members stay. Host
 * only.
 */
export const POST = withApi<{ id: string }>(async (_req, { user, params }) => {
  const id = parseId(params.id);
  if (!(await rotateInvite(user.id, id))) throw new ApiError("not_found", PARTY_NOT_FOUND);
  return json(await partyJson(user.id, id));
});

/**
 * DELETE /api/v1/parties/{id}/invite → Party (`invite.active: false`).
 * "Desactivar link": nobody else can enter; members stay. Idempotent. Host
 * only. Answers the resource (not 204) so the sheet can redraw at once.
 */
export const DELETE = withApi<{ id: string }>(async (_req, { user, params }) => {
  const id = parseId(params.id);
  if (!(await revokeInvite(user.id, id))) throw new ApiError("not_found", PARTY_NOT_FOUND);
  return json(await partyJson(user.id, id));
});

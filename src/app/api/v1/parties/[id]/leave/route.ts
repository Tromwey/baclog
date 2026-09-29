import { ApiError, withApi } from "@/authz/api";
import { leaveParty } from "@/modules/party-collections/write";
import { noContent, parseId } from "../../../_lib/http";
import { PARTY_NOT_FOUND } from "../../_lib/party";

/**
 * POST /api/v1/parties/{id}/leave → 204. "Salir de la fiesta" (contract C3):
 * guests only — the host, a non-member, an unknown id → the same 404. The
 * party leaves the guest's `GET /parties`; their songs stay, attributed.
 * A guest who leaves unblocked may come back with an active link; one the
 * host blocked comes back still blocked (the block survives the leave).
 */
export const POST = withApi<{ id: string }>(async (_req, { user, params }) => {
  const id = parseId(params.id);
  if (!(await leaveParty(user.id, id))) throw new ApiError("not_found", PARTY_NOT_FOUND);
  return noContent();
});

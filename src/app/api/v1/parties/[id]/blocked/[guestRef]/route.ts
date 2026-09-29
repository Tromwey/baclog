import { ApiError, withApi } from "@/authz/api";
import { GUEST_REF_RE } from "@/modules/party-collections/rules";
import { unblockGuest } from "@/modules/party-collections/write";
import { json, parseId } from "../../../../_lib/http";
import { partyJson } from "../../../_lib/party";

/**
 * DELETE /api/v1/parties/{id}/blocked/{guestRef} → Party. "Desbloquear"
 * (host only); `guestRef` comes from `Party.blockedGuests`. Unknown ref =
 * 404.
 */
export const DELETE = withApi<{ id: string; guestRef: string }>(async (_req, { user, params }) => {
  const id = parseId(params.id);
  const ref = typeof params.guestRef === "string" && GUEST_REF_RE.test(params.guestRef) ? params.guestRef : null;
  if (!ref || !(await unblockGuest(user.id, id, ref))) throw new ApiError("not_found");
  return json(await partyJson(user.id, id));
});

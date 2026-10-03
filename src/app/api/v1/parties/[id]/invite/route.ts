import { ApiError, requireOnboarded, withApi } from "@/authz/api";
import { revokeInvite, rotateInvite } from "@/modules/party-collections/write";
import { json, parseId } from "../../../_lib/http";
import { PARTY_NOT_FOUND, partyJson } from "../../_lib/party";

/**
 * POST /api/v1/parties/{id}/invite → Party. "Crear link nuevo": the active
 * link (if any) stops working and a new one is minted; members stay. Host
 * only. 429 `rate_limited` (+ `retryAfterSeconds`) past 10 links per hour
 * per party (C7); 409 `conflict` if no active link came out of it. F2.2:
 * 403 `onboarding_required` before the id is looked at (minting a link is
 * publishing the party's name to whoever gets it). Revoking is never gated.
 */
export const POST = withApi<{ id: string }>(async (_req, { user, params }) => {
  requireOnboarded(user);
  const id = parseId(params.id);
  const res = await rotateInvite(user.id, id);
  if (!res.ok) {
    switch (res.error) {
      case "not_found":
        throw new ApiError("not_found", PARTY_NOT_FOUND);
      case "rate_limited":
        throw new ApiError(
          "rate_limited",
          "Creaste varios links seguidos. Espera un momento para crear otro.",
          { retryAfterSeconds: res.retryAfterSeconds },
        );
      case "conflict":
        throw new ApiError("conflict");
    }
  }
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

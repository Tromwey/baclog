import { ApiError, withApi } from "@/authz/api";
import { joinParty } from "@/modules/party-collections/write";
import { json } from "../../../_lib/http";
import { LINK_DEAD, partyJson } from "../../../parties/_lib/party";

/**
 * POST /api/v1/invites/{token}/join → { party: Party, joined }. Enter the
 * party with its link (idempotent): "new" = first time ("ya estás dentro."),
 * "already" = a returning member (a blocked one stays blocked), "host".
 * 404 `LINK_DEAD` for a dead link or a user block with the host; 403
 * `onboarding_required` when the account hasn't finished onboarding (age
 * gate + name) — finish it, then retry.
 */
export const POST = withApi<{ token: string }>(async (_req, { user, params }) => {
  const token = typeof params.token === "string" ? params.token : "";
  const res = await joinParty(user.id, token);
  if (!res.ok) {
    if (res.error === "onboarding_required") {
      throw new ApiError("forbidden", "Termina tu registro para entrar a la fiesta.", {
        reason: "onboarding_required",
      });
    }
    throw new ApiError("not_found", LINK_DEAD);
  }
  return json({ party: await partyJson(user.id, res.backlogId), joined: res.joined });
});

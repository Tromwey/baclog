import { ApiError, readApiUser, withPublicApi } from "@/authz/api";
import { assertPartyLive } from "@/modules/party-collections/errors";
import { getInvitePreview } from "@/modules/party-collections/queries";
import { json } from "../../_lib/http";
import { toInvitePreview } from "../../_lib/wire";
import { LINK_DEAD } from "../../parties/_lib/party";

/**
 * GET /api/v1/invites/{token} → InvitePreview. The universal link
 * `get-kura.app/f/{token}` opened in the app — BEFORE or after sign-in:
 * public route (rate limit by IP), with an OPTIONAL bearer (`readApiUser`)
 * that fills `viewer` (joined / role / blocked) and gates identities against
 * the viewer's blocks. Malformed, unknown, revoked token — or a user block
 * with the host — is ONE 404 (`LINK_DEAD`): "este link ya no funciona".
 *
 * Migration 0033 not live → 503 `unavailable` for EVERY token (checked
 * before the token is even parsed, so it's no oracle — C1): the app says
 * "las fiestas llegan muy pronto." instead of killing a good link.
 * Own per-IP bucket `invite-ip` (60/min, B1).
 */
export const GET = withPublicApi<{ token: string }>(async (request, { params }) => {
  assertPartyLive();
  const token = typeof params.token === "string" ? params.token : "";
  const viewer = await readApiUser(request);
  const preview = await getInvitePreview(token, viewer?.id ?? null);
  if (!preview) throw new ApiError("not_found", LINK_DEAD);
  return json(toInvitePreview(preview));
}, { bucket: "invite-ip", limit: 60 });

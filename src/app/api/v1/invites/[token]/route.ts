import { ApiError, readApiUser, withPublicApi } from "@/authz/api";
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
 */
export const GET = withPublicApi<{ token: string }>(async (request, { params }) => {
  const token = typeof params.token === "string" ? params.token : "";
  const viewer = await readApiUser(request);
  const preview = await getInvitePreview(token, viewer?.id ?? null);
  if (!preview) throw new ApiError("not_found", LINK_DEAD);
  return json(toInvitePreview(preview));
});

import { revokeMobileSession } from "@/auth/mobile-sessions";
import { ApiError, withApi } from "@/authz/api";
import { noContent, parseId } from "../../../_lib/http";

const NOT_FOUND_MSG = "No encontramos esa sesión. Puede que ya se haya cerrado.";

/**
 * DELETE /api/v1/me/sessions/{id} → 204 (phase 4d). Revokes ONE of the
 * caller's device sessions and deletes its APNs tokens (one transaction,
 * `revokeMobileSession`): that install's next request is the uniform 401.
 * The caller's CURRENT session can be revoked too (this bearer dies with
 * it). Another account's id, an unknown id, a malformed id and an already
 * revoked session are the SAME 404 (no oracle for other people's sessions).
 */
export const DELETE = withApi<{ id: string }>(async (_request, { user, params }) => {
  let id: string;
  try {
    id = parseId(params.id);
  } catch {
    throw new ApiError("not_found", NOT_FOUND_MSG);
  }
  const revoked = await revokeMobileSession(user.id, id);
  if (!revoked) throw new ApiError("not_found", NOT_FOUND_MSG);
  return noContent();
});

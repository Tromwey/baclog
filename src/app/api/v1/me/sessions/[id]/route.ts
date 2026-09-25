import { revokeMobileSession } from "@/auth/mobile-sessions";
import { ApiError, withApi } from "@/authz/api";
import { SESSIONS_UNAVAILABLE, requireMigration0029 } from "../../../_lib/devices";
import { noContent, parseId } from "../../../_lib/http";

const NOT_FOUND_MSG = "No encontramos esa sesión. Puede que ya se haya cerrado.";

/**
 * DELETE /api/v1/me/sessions/{id} → 204 (phase 4d). Revokes ONE of the
 * caller's device sessions and deletes its APNs tokens (one transaction,
 * `revokeMobileSession`): that install's next request is the uniform 401.
 * The caller's CURRENT session can be revoked too (this bearer dies with
 * it). Another account's id, an unknown id, a malformed id and an already
 * revoked session are the SAME 404 (no oracle for other people's sessions).
 * 503 `unavailable` until migration 0029.
 */
export const DELETE = withApi<{ id: string }>(async (_request, { user, params }) => {
  requireMigration0029(SESSIONS_UNAVAILABLE);
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

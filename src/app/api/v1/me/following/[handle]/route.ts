import { ApiError, withApi } from "@/authz/api";
import { parseHandleOrNull } from "@/modules/account/username";
import { followUser, unfollowUser } from "@/modules/social/follow";
import { noContent } from "../../../_lib/http";

const NOT_FOUND_MSG = "No encontramos ese perfil. Puede que sea privado o que ya no exista.";

/** Same 404 body whatever failed — a malformed handle must not read
 *  differently from a nonexistent one (the shape would be an oracle). */
function handleOf(raw: string | string[] | undefined): string {
  const handle = parseHandleOrNull(typeof raw === "string" ? raw : null);
  if (!handle) throw new ApiError("not_found", NOT_FOUND_MSG);
  return handle;
}

/**
 * PUT /api/v1/me/following/{handle} → 204 (§4 Gente). Only PUBLIC profiles
 * are followable; own, private, nonexistent AND malformed handles are the
 * SAME 404 (`modules/account/username.ts` grammar + `modules/social/follow.ts`,
 * no enumeration oracle). Idempotent: following twice is one row.
 */
export const PUT = withApi<{ handle: string }>(async (_request, { user, params }) => {
  const result = await followUser(user.id, handleOf(params.handle));
  if ("error" in result) throw new ApiError("not_found", NOT_FOUND_MSG);
  return noContent();
});

/**
 * DELETE /api/v1/me/following/{handle} → 204. NOT gated on isPublic, on
 * purpose (AGENTS.md): a follow toward a profile that went private must stay
 * removable. Unknown handle or no edge → still 204: the response never
 * varies, and the inert rows are never cleaned up by anything else. Only a
 * handle that can't be a username at all is a 404 (same body as PUT's).
 */
export const DELETE = withApi<{ handle: string }>(async (_request, { user, params }) => {
  const result = await unfollowUser(user.id, handleOf(params.handle));
  if ("error" in result) throw new ApiError("not_found", NOT_FOUND_MSG);
  return noContent();
});

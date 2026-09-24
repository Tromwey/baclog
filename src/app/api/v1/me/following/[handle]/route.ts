import { ApiError, withApi } from "@/authz/api";
import { followUser, unfollowUser } from "@/modules/social/follow";
import { noContent } from "../../../_lib/http";

const INVALID_MSG =
  "Ese nombre de usuario no tiene la forma correcta. Revisa el enlace.";

function handleOf(params: { handle?: string | string[] }): string {
  const raw = Array.isArray(params.handle) ? params.handle[0] : params.handle;
  return (raw ?? "").replace(/^@/, "");
}

/**
 * PUT /api/v1/me/following/{handle} → 204 (§4 Gente). Only PUBLIC profiles
 * are followable; own, private and nonexistent handles are the SAME 404
 * (`modules/social/follow.ts`, no enumeration oracle). Idempotent: following
 * twice is one row.
 */
export const PUT = withApi<{ handle: string }>(async (_request, { user, params }) => {
  const result = await followUser(user.id, handleOf(params));
  if ("error" in result) {
    if (result.error === "invalid") throw new ApiError("invalid", INVALID_MSG);
    throw new ApiError(
      "not_found",
      "No encontramos ese perfil. Puede que sea privado o que ya no exista.",
    );
  }
  return noContent();
});

/**
 * DELETE /api/v1/me/following/{handle} → 204. NOT gated on isPublic, on
 * purpose (AGENTS.md): a follow toward a profile that went private must stay
 * removable. Unknown handle or no edge → still 204: the response never
 * varies, and the inert rows are never cleaned up by anything else.
 */
export const DELETE = withApi<{ handle: string }>(async (_request, { user, params }) => {
  const result = await unfollowUser(user.id, handleOf(params));
  if ("error" in result) throw new ApiError("invalid", INVALID_MSG);
  return noContent();
});

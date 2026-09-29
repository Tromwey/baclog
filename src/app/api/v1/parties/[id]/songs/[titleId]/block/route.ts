import { ApiError, withApi } from "@/authz/api";
import { removeSongAndBlockAuthor } from "@/modules/party-collections/write";
import { json, parseId } from "../../../../../_lib/http";
import { PARTY_NOT_FOUND, partyJson } from "../../../../_lib/party";

/**
 * POST /api/v1/parties/{id}/songs/{titleId}/block → Party. "Quitar y
 * bloquear a @x" (host only): the song leaves the party and its author can
 * no longer add songs (still sees the party and may remove their own — C4;
 * not notified). 409 `conflict` if nothing was removed and the cause is
 * unknown (C5).
 * 409 `not_blockable` when the song is the host's own or its author deleted
 * the account (offer plain "Quitar").
 */
export const POST = withApi<{ id: string; titleId: string }>(async (_req, { user, params }) => {
  const id = parseId(params.id);
  const titleId = parseId(params.titleId);
  const res = await removeSongAndBlockAuthor(user.id, id, titleId);
  if (!res.ok) {
    if (res.error === "not_blockable") {
      throw new ApiError("conflict", "A esa persona no se le puede bloquear aquí. Solo puedes quitar la canción.", {
        reason: "not_blockable",
      });
    }
    if (res.error === "conflict") throw new ApiError("conflict");
    throw new ApiError("not_found", PARTY_NOT_FOUND);
  }
  return json(await partyJson(user.id, id));
});

import { ApiError, withApi } from "@/authz/api";
import { fillPartySongPalette } from "@/modules/party-collections/write";
import { noContent, parseId, readJson } from "../../../../../_lib/http";
import { PartySongPaletteBodySchema } from "../../../../../_lib/schemas";

/**
 * PUT /api/v1/parties/{id}/songs/{titleId}/palette { paletteHex } → 204.
 * The on-device cover palette of a song IN this party (the party's aura),
 * first writer wins. Members not blocked by the host (a blocked guest → 404,
 * nothing to do; B7). The generic `PUT /titles/{id}/palette`
 * doesn't take songs (a song is not a `Title`).
 */
export const PUT = withApi<{ id: string; titleId: string }>(async (request, { user, params }) => {
  const id = parseId(params.id);
  const titleId = parseId(params.titleId);
  const { paletteHex } = await readJson(request, PartySongPaletteBodySchema);
  if (!(await fillPartySongPalette(user.id, id, titleId, paletteHex))) throw new ApiError("not_found");
  return noContent();
});

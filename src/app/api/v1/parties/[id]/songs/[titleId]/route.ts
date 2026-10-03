import { ApiError, withApi } from "@/authz/api";
import { duplicateMessage } from "@/modules/party-collections/rules";
import { addSong, removeSong } from "@/modules/party-collections/write";
import { json, parseId, readOptionalJson } from "../../../../_lib/http";
import { AddPartySongBodySchema } from "../../../../_lib/schemas";
import { PARTY_NOT_FOUND, partyJson } from "../../../_lib/party";

const SONG_NOT_FOUND =
  "Esa canción todavía no está en el catálogo. Búscala de nuevo y vuelve a agregarla.";

/**
 * PUT /api/v1/parties/{id}/songs/{titleId} { paletteHex? } → Party.
 * `titleId` = a `PartySongHit.titleId` (a catalog SONG). Refusals:
 *   404 party not visible · 404 not a song
 *   403 `blocked` (the host blocked you) · 403 `view_only` (solo ver)
 *   409 `duplicate_mine` ("Ya la pusiste tú.") · 409 `duplicate_other`
 *       ("Ya está, la puso @ana", with `addedBy`) · 409 `cap_reached`
 *   409 `conflict` without reason: nothing written, cause unknown — reload
 * The `message` of each is the design's copy, show it as is.
 */
export const PUT = withApi<{ id: string; titleId: string }>(async (request, { user, params }) => {
  const id = parseId(params.id);
  const titleId = parseId(params.titleId);
  const body = await readOptionalJson(request, AddPartySongBodySchema);
  const res = await addSong(user.id, id, titleId, body.paletteHex ?? null);
  if (res.ok) return json(await partyJson(user.id, id));
  switch (res.error) {
    case "not_found":
      throw new ApiError("not_found", PARTY_NOT_FOUND);
    case "song_not_found":
      throw new ApiError("not_found", SONG_NOT_FOUND);
    case "blocked":
      throw new ApiError("forbidden", "Ya no puedes agregar canciones a esta fiesta.", { reason: "blocked" });
    case "view_only":
      throw new ApiError("forbidden", "En esta fiesta solo se puede ver la colección.", { reason: "view_only" });
    case "duplicate_mine":
      throw new ApiError("conflict", duplicateMessage(true, null), { reason: "duplicate_mine" });
    case "duplicate_other":
      throw new ApiError("conflict", duplicateMessage(false, res.addedBy?.handle ?? null), {
        reason: "duplicate_other",
        addedBy: res.addedBy,
      });
    case "cap_reached":
      throw new ApiError("conflict", "Ya agregaste todas tus canciones. Quita una para cambiarla.", {
        reason: "cap_reached",
      });
    case "conflict":
      // Nothing was written and nobody knows why (logged in the module, C5).
      throw new ApiError("conflict");
  }
});

/**
 * DELETE /api/v1/parties/{id}/songs/{titleId} → Party. Host: any song.
 * Guest: own songs — also while blocked by the host (C4); someone else's →
 * 403 `forbidden` + `not_yours`. A song that isn't there is not an error
 * (idempotent). 409 `conflict` if the delete removed nothing and the cause
 * is unknown (C5). Answers the fresh party (not 204) so the slots/"te
 * quedan N" redraw from the server.
 */
export const DELETE = withApi<{ id: string; titleId: string }>(async (_req, { user, params }) => {
  const id = parseId(params.id);
  const titleId = parseId(params.titleId);
  const res = await removeSong(user.id, id, titleId);
  if (!res.ok) {
    if (res.error === "forbidden") {
      throw new ApiError("forbidden", "Solo puedes quitar las canciones que agregaste tú.", { reason: "not_yours" });
    }
    if (res.error === "conflict") throw new ApiError("conflict");
    throw new ApiError("not_found", PARTY_NOT_FOUND);
  }
  return json(await partyJson(user.id, id));
});

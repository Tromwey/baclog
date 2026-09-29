import { withApi } from "@/authz/api";
import { disconnectTidal } from "@/modules/music-export/tidal-auth";
import { noContent } from "../../_lib/http";

/**
 * DELETE /api/v1/music/tidal → 204. "Desconectar TIDAL": forgets the stored
 * tokens (idempotent). Playlists already created stay in the person's TIDAL.
 */
export const DELETE = withApi(async (_req, { user }) => {
  await disconnectTidal(user.id);
  return noContent();
});

import { withApi } from "@/authz/api";
import { removeTitleFromLibrary } from "@/modules/backlog/membership";
import { noContent, uuidOrNull } from "../../../_lib/http";

/**
 * DELETE /api/v1/me/titles/{id} → 204 (§4 Títulos y estado propio). "Quitar
 * de mi biblioteca": every membership, the per-title state and the review
 * (`removeTitleFromLibrary`, the same path as `removeFromLibraryAction`).
 * Idempotent — a title the caller never had (or an id that can't be one)
 * is still a 204.
 */
export const DELETE = withApi<{ id: string }>(async (_req, { user, params }) => {
  const id = uuidOrNull(params.id);
  if (id) await removeTitleFromLibrary(user.id, id);
  return noContent();
});

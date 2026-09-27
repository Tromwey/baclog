import { z } from "zod";
import { assertOwnsBacklog } from "@/authz";
import { ApiError, withApi } from "@/authz/api";
import {
  getOwnCollection,
  reorderBacklogTitles,
  reorderSchema,
} from "@/modules/backlog/collections";
import { json, parseId, readJson } from "../../../_lib/http";
import { toCollection } from "../../../_lib/wire";

const BodySchema = z.object({ titleIds: z.unknown() });

/**
 * PUT /api/v1/collections/{id}/order { titleIds: [titleId] } → 200 Collection
 * (re-read). Reordenar from the app: the collection's titles first to last
 * (max 2000). The same renumbering as the web's Reordenar
 * (`reorderBacklogTitles` → positions 0…n−1 in ONE statement), keyed by
 * title id because that is what the wire speaks. Ids that aren't members of
 * THIS collection are ignored; members the list left out go back to
 * unplaced (on top, newest first) — so an empty list resets to the
 * automatic order. Ownership first: foreign/nonexistent/malformed = the same
 * 404. A body that doesn't validate is 400 `fields.titleIds` (one key for the
 * whole list, never `titleIds.N`).
 */
export const PUT = withApi<{ id: string }>(async (request, { user, params }) => {
  const { backlog } = await assertOwnsBacklog(parseId(params.id));
  const body = await readJson(request, BodySchema);
  const parsed = reorderSchema.safeParse(body.titleIds);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Lista de títulos no válida.";
    throw new ApiError("invalid", undefined, { fields: { titleIds: message } });
  }
  if (!(await reorderBacklogTitles(user.id, backlog.id, parsed.data))) {
    throw new ApiError("not_found");
  }
  const row = await getOwnCollection(user.id, backlog.id);
  if (!row) throw new ApiError("not_found");
  return json(toCollection(row));
});

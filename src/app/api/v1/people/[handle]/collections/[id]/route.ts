import { withApi, ApiError } from "@/authz/api";
import { json, parseHandle, parseId } from "@/app/api/v1/_lib/http";
import { toCollectionDetail } from "@/app/api/v1/_lib/wire";
import { getPublicBacklog } from "@/modules/backlog/public";
import { assertNotBlocked } from "../../../_lib/person";

/**
 * GET /api/v1/people/{handle}/collections/{id} → the same shape as
 * `GET /collections/{id}` (collection + titles + states), read through
 * `getPublicBacklog`: gated on the owner being public AND the backlog being
 * public inside the query, so a private shelf, a private owner, a wrong
 * owner/backlog pair, a malformed id and a nonexistent one are one
 * identical 404. A block in EITHER direction between the caller and the
 * owner is that same 404 too (`assertNotBlocked`, App Store 1.2).
 *
 * `states` here is the OWNER's state as the public page already shows it:
 * `obsessed` always, a verdict only once completed (F3.7 — the module gates
 * it in SQL). `savedAt` is the membership's `addedAt` (when it entered THIS
 * collection): `user_item.addedAt` — the first save, across shelves — is not
 * part of the public field list, and this is the closest public instant.
 */
export const GET = withApi<{ handle: string; id: string }>(
  async (_req, { user, params }) => {
    const handle = parseHandle(params.handle);
    const id = parseId(params.id);

    const [row] = await Promise.all([
      getPublicBacklog(handle, id),
      assertNotBlocked(user.id, handle),
    ]);
    if (!row) throw new ApiError("not_found");

    return json(
      toCollectionDetail(
        {
          id: row.backlogId,
          name: row.backlogName,
          vibe: row.vibe,
          // The query only returns public backlogs; showOnProfile picks link/profile.
          isPublic: true,
          showOnProfile: row.showOnProfile,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        },
        row.items.map((it) => ({ ...it, savedAt: it.addedAt, reviewId: null })),
      ),
    );
  },
);

import { withApi, ApiError } from "@/authz/api";
import { json } from "@/app/api/v1/_lib/http";
import {
  toCollection,
  toTitleState,
  toTitleSummary,
} from "@/app/api/v1/_lib/wire";
import type { Title, TitleState } from "@/app/api/v1/_lib/schemas";
import { getPublicBacklog } from "@/modules/backlog/public";
import { parseHandle } from "../../../_lib/person";

/**
 * GET /api/v1/people/{handle}/collections/{id} → the same shape as
 * `GET /collections/{id}` (collection + titles + states), read through
 * `getPublicBacklog`: gated on the owner being public AND the backlog being
 * public inside the query, so a private shelf, a private owner, a wrong
 * owner/backlog pair and a nonexistent id are one identical 404.
 *
 * `states` here is the OWNER's state as the public page already shows it:
 * `obsessed` always, a verdict only once completed (F3.7 — the module gates
 * it in SQL). `savedAt` is the membership's `addedAt` (when it entered THIS
 * collection): `user_item.addedAt` — the first save, across shelves — is not
 * part of the public field list, and this is the closest public instant.
 */
export const GET = withApi<{ handle: string; id: string }>(
  async (_req, { params }) => {
    const handle = parseHandle(params.handle);
    const id = typeof params.id === "string" ? params.id : "";
    if (!id) throw new ApiError("not_found");

    const row = await getPublicBacklog(handle, id);
    if (!row) throw new ApiError("not_found");

    const collection = toCollection({
      id: row.backlogId,
      name: row.backlogName,
      vibe: row.vibe,
      // The query only returns public backlogs; showOnProfile picks link/profile.
      isPublic: true,
      showOnProfile: row.showOnProfile,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      memberships: row.items.map((it) => ({
        catalogItemId: it.catalogItemId,
        addedAt: it.addedAt,
        posterUrl: it.posterUrl,
      })),
    });

    const titles: Title[] = [];
    const states: Record<string, TitleState> = {};
    for (const it of row.items) {
      if (it.catalogItemId in states) continue;
      titles.push(
        toTitleSummary({
          id: it.catalogItemId,
          title: it.title,
          mediaType: it.mediaType,
          year: it.year,
          byline: it.byline,
          posterUrl: it.posterUrl,
          paletteHex: it.paletteHex,
        }),
      );
      states[it.catalogItemId] = toTitleState({
        catalogItemId: it.catalogItemId,
        status: it.status,
        verdict: it.verdict,
        obsessed: it.obsessed,
        addedAt: it.addedAt,
        reviewId: null,
      });
    }

    return json({ collection, titles, states });
  },
);

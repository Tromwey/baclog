import { z } from "zod";
import { assertOwnsBacklog } from "@/authz";
import { ApiError, withApi } from "@/authz/api";
import {
  addTitleToBacklog,
  removeTitleFromBacklog,
} from "@/modules/backlog/membership";
import { paletteHexSchema } from "@/modules/backlog/palette";
import { getOwnTitleState } from "@/modules/backlog/state";
import { getCatalogItem } from "@/modules/catalog/cache";
import { resolveCatalogItem } from "../../../../_lib/catalog";
import { json, noContent, parseId, readOptionalJson, uuidOrNull } from "../../../../_lib/http";
import { ExternalRefSchema } from "../../../../_lib/schemas";
import { toTitleState, toTitleSummary } from "../../../../_lib/wire";

/**
 * Membership of ONE title in ONE collection (§4 Colecciones). Both verbs are
 * idempotent by natural key (collection, title): repeating never fails.
 */

const PutBodySchema = z.object({
  /** Fallback ONLY: used when `titleId` is not a cached catalog id. */
  externalRef: ExternalRefSchema.optional(),
  /** Cover-extracted on-device; written to the shared cache if still empty. */
  paletteHex: paletteHexSchema.optional(),
});

const NOT_IN_CATALOG =
  "Ese título todavía no está en el catálogo. Búscalo de nuevo y vuelve a guardarlo.";

/**
 * PUT /api/v1/collections/{id}/titles/{titleId} { externalRef?, paletteHex? }
 * → { title: Title, state: TitleState }.
 *
 * Ownership of the collection first (404 identical for foreign/nonexistent/
 * malformed), then the title: the cached catalog id, or — only as a fallback —
 * the `(source, externalId)` pair the search result carried
 * (`resolveCatalogItem`). A title the catalog never cached is a 404 that
 * tells the app to search again (the search upsert is what caches; this
 * handler never calls a provider). The returned `title.id` is the canonical
 * catalog id — the app adopts it when it differs from the id it sent.
 */
export const PUT = withApi<{ id: string; titleId: string }>(
  async (request, { user, params }) => {
    const { backlog } = await assertOwnsBacklog(parseId(params.id));
    const body = await readOptionalJson(request, PutBodySchema);

    const item = await resolveCatalogItem(params.titleId, body.externalRef);
    if (!item) throw new ApiError("not_found", NOT_IN_CATALOG);

    const res = await addTitleToBacklog(user.id, backlog.id, item.id, body.paletteHex);
    if (!res.ok) {
      throw new ApiError("not_found", res.error === "title_not_found" ? NOT_IN_CATALOG : undefined);
    }

    // Re-read both: the palette may have just been filled, and the state is
    // whatever `user_item` says (an existing row keeps its status/mark).
    const [fresh, state] = await Promise.all([
      getCatalogItem(item.id),
      getOwnTitleState(user.id, item.id),
    ]);
    if (!state) throw new ApiError("internal");
    return json({ title: toTitleSummary(fresh ?? item), state: toTitleState(state) });
  },
);

/**
 * DELETE /api/v1/collections/{id}/titles/{titleId} → 204. Drops this one
 * membership; when it was the title's last, the per-title state and the
 * review go with it (`removeTitleFromBacklog`, which also GCs on a repeat —
 * idempotent). A title id that can't be a catalog id is nothing to remove:
 * still 204. The app defers the call 5 s for its Deshacer, so there is no
 * server-side undo.
 */
export const DELETE = withApi<{ id: string; titleId: string }>(
  async (_req, { user, params }) => {
    const { backlog } = await assertOwnsBacklog(parseId(params.id));
    const titleId = uuidOrNull(params.titleId);
    if (titleId) await removeTitleFromBacklog(user.id, backlog.id, titleId);
    return noContent();
  },
);

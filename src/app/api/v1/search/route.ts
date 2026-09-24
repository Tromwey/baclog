import { z } from "zod";
import { withApi, ApiError } from "@/authz/api";
import { unifiedSearchDetailed } from "@/modules/catalog/search";
import { json, readQuery } from "../_lib/http";
import type { SearchResult } from "../_lib/schemas";

/**
 * GET /api/v1/search?q=&kind=all|film|series|album (§4 Descubrir y búsqueda)
 * → `{ items: [SearchResult] }`.
 *
 * Same call the web search makes (`unifiedSearch`): TMDB + iTunes in
 * parallel, hits upserted into `catalog_item` on the way through, so every
 * result already has a local `id` — `externalRef` rides along anyway for the
 * contract's "not cached yet" branch and for the membership PUT.
 *
 * 503 `unavailable` ONLY when every provider that was asked failed and
 * nothing came back: an honest empty result (providers fine, no hits) stays a
 * 200 with `items: []`, and one dead provider never hides the other's hits.
 */

const QuerySchema = z.object({
  q: z.string().trim().min(1, "Escribe algo para buscar.").max(100),
  kind: z.enum(["all", "film", "series", "album"]).default("all"),
});

export const GET = withApi(async (req) => {
  const { q, kind } = readQuery(req, QuerySchema);
  const asked = kind === "all" ? 3 : 1;
  const { results, failed } = await unifiedSearchDetailed(q, kind);
  if (results.length === 0 && failed.length >= asked) {
    throw new ApiError("unavailable");
  }

  const items: SearchResult[] = results.map((r) => ({
    id: r.catalogItemId,
    externalRef: { source: r.source, externalId: r.externalId },
    name: r.title,
    format: r.mediaType,
    year: r.year,
    creator: r.byline,
    coverUrl: r.posterUrl,
    palette: r.paletteHex ?? [],
  }));
  return json({ items });
});

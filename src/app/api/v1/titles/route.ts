import { z } from "zod";
import { withApi } from "@/authz/api";
import { getCatalogItems } from "@/modules/catalog/cache";
import { json, readQuery } from "../_lib/http";
import { toTitleSummary } from "../_lib/wire";

/**
 * GET /api/v1/titles?ids=a,b,c → { items: [Title] } (§4 Títulos) — summary
 * hydration for collections and the feed. ≤ 50 ids; unknown ids are omitted
 * (the app treats a missing id as "no longer in the catalog"); no ids → empty.
 * Shared catalog facts only, so the bearer gate is the only gate.
 * `GET /titles/{id}` (detail) is its own route.
 */

const MAX_IDS = 50;

const QuerySchema = z.object({
  ids: z
    .string()
    .optional()
    .transform((raw) =>
      (raw ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    )
    .pipe(
      z
        .array(z.string().max(64))
        .max(MAX_IDS, `Máximo ${MAX_IDS} ids por petición`),
    ),
});

export const GET = withApi(async (req) => {
  const { ids } = readQuery(req, QuerySchema);
  const unique = [...new Set(ids)];
  if (unique.length === 0) return json({ items: [] });

  const rows = await getCatalogItems(unique);
  const byId = new Map(rows.map((r) => [r.id, r]));
  // Keep the caller's order: the app zips the result against what it asked.
  const items = unique.flatMap((id) => {
    const r = byId.get(id);
    return r ? [toTitleSummary(r)] : [];
  });
  return json({ items });
});

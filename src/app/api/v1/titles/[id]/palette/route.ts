import { z } from "zod";
import { ApiError, withApi } from "@/authz/api";
import { paletteHexSchema } from "@/modules/backlog/palette";
import { fillCatalogPalette, getCatalogItem } from "@/modules/catalog/cache";
import { json, parseId, readJson } from "../../../_lib/http";
import { toTitleSummary } from "../../../_lib/wire";

/** At least one hex: an extraction that found nothing is not a palette. */
const BodySchema = z.object({ paletteHex: paletteHexSchema.min(1) });

/**
 * PUT /api/v1/titles/{id}/palette { paletteHex } → `Title` (summary, re-read)
 * (§4 Títulos) — the app's twin of the web's `cacheItemPaletteAction`: a title
 * the app SHOWS (not saves) with `palette: []` gets its cover extracted
 * on-device and fills the shared cache here, so the next viewer reads it.
 * Saving has its own channel (`paletteHex` on the membership PUT).
 *
 * Same posture as the web: bearer only (no anonymous write surface), strict
 * `#RRGGBB` × 1..6, and `fillCatalogPalette` writes ONLY while the column is
 * NULL (first-writer-wins: never clobbers). Idempotent — a repeat, or a title
 * someone already filled, is a 200 with the palette that WON, which the app
 * adopts. The server never touches the artwork. Malformed/unknown id → the
 * same 404 as `GET /titles/{id}`.
 */
export const PUT = withApi<{ id: string }>(async (req, { params }) => {
  const id = parseId(params.id);
  const { paletteHex } = await readJson(req, BodySchema);

  await fillCatalogPalette(id, paletteHex);
  const item = await getCatalogItem(id);
  if (!item) throw new ApiError("not_found");
  return json(toTitleSummary(item));
});

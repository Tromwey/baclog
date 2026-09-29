import { z } from "zod";
import { ApiError, withApi } from "@/authz/api";
import { searchPartySongs } from "@/modules/party-collections/search";
import { json, parseId, readQuery } from "../../../_lib/http";
import { toPartySongHit } from "../../../_lib/wire";
import { PARTY_NOT_FOUND } from "../../_lib/party";

const QuerySchema = z.object({ q: z.string().trim().min(1).max(100) });

/**
 * GET /api/v1/parties/{id}/songs?q= → { items: [PartySongHit] } — iTunes
 * songs, each with `inParty` (null · { mine, addedBy }). Members only.
 * 503 `unavailable` when iTunes is down (the "Reintentar" state) — an empty
 * `items` is an honest "sin resultados". 429 on the per-user search limit.
 */
export const GET = withApi<{ id: string }>(async (request, { user, params }) => {
  const id = parseId(params.id);
  const { q } = readQuery(request, QuerySchema);
  const res = await searchPartySongs(user.id, id, q);
  if (res.ok) return json({ items: res.items.map(toPartySongHit) });
  switch (res.error) {
    case "not_found":
      throw new ApiError("not_found", PARTY_NOT_FOUND);
    case "invalid":
      throw new ApiError("invalid", undefined, { fields: { q: "Escribe qué canción buscas." } });
    case "unavailable":
      throw new ApiError(
        "unavailable",
        "No pudimos buscar canciones en este momento. Inténtalo de nuevo en unos segundos.",
      );
    case "rate_limited":
      throw new ApiError("rate_limited", undefined, { retryAfterSeconds: res.retryAfterSeconds });
  }
});

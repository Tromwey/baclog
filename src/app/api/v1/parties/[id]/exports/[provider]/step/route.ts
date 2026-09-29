import { ApiError, withApi } from "@/authz/api";
import { stepTidalExport } from "@/modules/music-export/exports";
import { json, parseId } from "../../../../../_lib/http";
import { ExportStateSchema } from "../../../../../_lib/schemas";
import { toExportState } from "../../../../../_lib/wire";

/**
 * POST /api/v1/parties/{id}/exports/tidal/step → ExportState after ONE batch
 * (≤ 10 songs). Loop while `status === "in_progress"`; draw
 * `processed/total` and "Buscando {current.title} en TIDAL…". `busy: true` =
 * another step of this export is running: wait ~1 s and call again.
 * Errors: 409 `not_connected` · 503 `service_failed` ("no se pudo
 * exportar.", progress kept — retry calls step again) · 429
 * `service_rate_limited` + `retryAfterSeconds`. Only `tidal` (Apple Music
 * runs on the client) — anything else is 404.
 */
export const POST = withApi<{ id: string; provider: string }>(async (_req, { user, params }) => {
  const id = parseId(params.id);
  if (params.provider !== "tidal") throw new ApiError("not_found");
  const state = await stepTidalExport(user.id, id);
  return json(ExportStateSchema.parse(toExportState(state)));
});

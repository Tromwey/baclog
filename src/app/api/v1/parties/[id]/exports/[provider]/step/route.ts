import { ApiError, withApi } from "@/authz/api";
import { parseOutput } from "@/lib/output";
import { stepTidalExport } from "@/modules/music-export/exports";
import { json, parseId } from "../../../../../_lib/http";
import { ExportStateSchema } from "../../../../../_lib/schemas";
import { toExportState } from "../../../../../_lib/wire";

/**
 * POST /api/v1/parties/{id}/exports/tidal/step → ExportState after ONE batch
 * (≤ 10 songs; FEWER when the step's time budget ran out — same shape,
 * `processed` just advanced less). Loop while `status === "in_progress"`; draw
 * `processed/total` and "Buscando {current.title} en TIDAL…". `busy: true` =
 * another step of this export is running: wait ~1 s and call again.
 * Errors: 409 `not_connected` · 503 `service_failed` ("no se pudo
 * exportar.", progress kept — retry calls step again) · 429
 * `service_rate_limited` + `retryAfterSeconds`. Only `tidal` (Apple Music
 * runs on the client) — anything else is 404.
 */
/**
 * A step answers within its own budget (`STEP_BUDGET_MS`, 12 s of upstream
 * time, modules/music-export/budget.ts): the apps cut the request at 20 s and
 * don't retry, so the step cuts its batch instead and the songs it didn't
 * reach stay `pending` for the next call. `maxDuration` is the backstop for a
 * step that hangs anyway, and it is never longer than the step's lease
 * (`LEASE_MS` in modules/music-export/exports.ts, 60 s): a step can't outlive
 * the lease that makes it the only one running. The web calls the same step
 * as a server action from /c/[backlogId], whose page declares the same
 * number. `check-music-export` keeps all of it together.
 */
export const maxDuration = 60;

export const POST = withApi<{ id: string; provider: string }>(async (_req, { user, params }) => {
  const id = parseId(params.id);
  if (params.provider !== "tidal") throw new ApiError("not_found");
  const state = await stepTidalExport(user.id, id);
  return json(parseOutput(ExportStateSchema, toExportState(state), "ExportState"));
});

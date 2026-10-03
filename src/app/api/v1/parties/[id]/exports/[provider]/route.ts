import { ApiError, withApi } from "@/authz/api";
import {
  getExportState,
  reportAppleMusicExport,
  startExport,
} from "@/modules/music-export/exports";
import { parseOutput } from "@/lib/output";
import { parseProvider } from "@/modules/music-export/rules";
import type { MusicProvider } from "@/modules/music-export/types";
import { json, parseId, readJson } from "../../../../_lib/http";
import { AppleMusicReportBodySchema, ExportStateSchema } from "../../../../_lib/schemas";
import { toExportState } from "../../../../_lib/wire";

/**
 * /api/v1/parties/{id}/exports/{provider}   provider = apple_music | tidal
 *   GET  → ExportState (no work; `status: "idle"` when never started)
 *   POST → ExportState: create/resume the export, re-queue the `missing`
 *          (TIDAL: 409 `not_connected` without a link)
 *   PUT  → (apple_music only) the client's report: `{ playlistId | null,
 *          replace?, added[], missing[] }` → ExportState; 409
 *          `playlist_exists` when another playlist is on record and `replace`
 *          isn't set; 429 after 30 reports/min.
 * Party not visible = the party 404. Unknown provider = 404.
 */

function provider(raw: string | string[] | undefined): MusicProvider {
  const p = parseProvider(raw);
  if (!p) throw new ApiError("not_found");
  return p;
}

type Params = { id: string; provider: string };

export const GET = withApi<Params>(async (_req, { user, params }) => {
  const state = await getExportState(user.id, parseId(params.id), provider(params.provider));
  return json(parseOutput(ExportStateSchema, toExportState(state), "ExportState"));
});

export const POST = withApi<Params>(async (_req, { user, params }) => {
  const state = await startExport(user.id, parseId(params.id), provider(params.provider));
  return json(parseOutput(ExportStateSchema, toExportState(state), "ExportState"));
});

export const PUT = withApi<Params>(async (req, { user, params }) => {
  const id = parseId(params.id);
  if (provider(params.provider) !== "apple_music") throw new ApiError("not_found");
  const body = await readJson(req, AppleMusicReportBodySchema);
  const state = await reportAppleMusicExport(user.id, id, body);
  return json(parseOutput(ExportStateSchema, toExportState(state), "ExportState"));
});

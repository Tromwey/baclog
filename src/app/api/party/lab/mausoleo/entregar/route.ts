import { labEntregar } from "@/modules/party/lab";
import { lab } from "../../_lib";

/** POST /api/party/lab/mausoleo/entregar { extras? } → { entregados, en, total, tuyos, nichos } */
export const POST = (request: Request) => lab(request, (deviceId, body) => labEntregar(deviceId, body.extras));

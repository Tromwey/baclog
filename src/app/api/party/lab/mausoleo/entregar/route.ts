import { labEntregar } from "@/modules/party/lab";
import { lab } from "../../_lib";

/** POST /api/party/lab/mausoleo/entregar → { entregados, en, total, tuyos, nichos } */
export const POST = (request: Request) => lab(request, (deviceId) => labEntregar(deviceId));

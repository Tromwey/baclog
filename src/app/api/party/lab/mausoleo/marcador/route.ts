import { labMarcador } from "@/modules/party/lab";
import { lab } from "../../_lib";

/** GET /api/party/lab/mausoleo/marcador → { top, tu, firmados } */
export const GET = (request: Request) => lab(request, (deviceId) => labMarcador(deviceId));

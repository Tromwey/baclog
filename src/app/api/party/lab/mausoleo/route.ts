import { labMausoleo } from "@/modules/party/lab";
import { lab } from "../_lib";

/** GET /api/party/lab/mausoleo → { total, tuyos, nichos } (title and text only of the open niches) */
export const GET = (request: Request) => lab(request, (deviceId) => labMausoleo(deviceId));

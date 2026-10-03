import { labProgreso } from "@/modules/party/lab";
import { lab } from "../_lib";

/** GET /api/party/lab/progreso → { sellos, apodo, mausoleo, todos } */
export const GET = (request: Request) => lab(request, (deviceId) => labProgreso(deviceId));

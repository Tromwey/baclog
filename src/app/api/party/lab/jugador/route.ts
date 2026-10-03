import { labSetApodo } from "@/modules/party/lab";
import { lab } from "../_lib";

/** PUT /api/party/lab/jugador { apodo } → { apodo } */
export const PUT = (request: Request) => lab(request, (deviceId, body) => labSetApodo(deviceId, body.apodo));

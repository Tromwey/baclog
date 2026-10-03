import { labIniciar } from "@/modules/party/lab";
import { lab } from "../_lib";

/** POST /api/party/lab/intentos { lapida } → { token, semilla, expira } · 404 · 409 */
export const POST = (request: Request) => lab(request, (deviceId, body) => labIniciar(deviceId, body.lapida));

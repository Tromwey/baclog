import { labOuija } from "@/modules/party/lab";
import { lab } from "../_lib";

/** POST /api/party/lab/ouija { nombre } → { texto, para } */
export const POST = (request: Request) => lab(request, (deviceId, body) => labOuija(deviceId, body.nombre));

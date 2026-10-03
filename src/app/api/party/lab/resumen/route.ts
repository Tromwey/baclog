import { labResumen } from "@/modules/party/lab";
import { lab } from "../_lib";

/** GET /api/party/lab/resumen → { ganados, entregados, porJugador } — everyone's seals, numbers only. */
export const GET = (request: Request) => lab(request, () => labResumen());

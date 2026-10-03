import { labRsvp, labRsvpEstado } from "@/modules/party/lab";
import { lab } from "../_lib";

/** GET /api/party/lab/rsvp → { abierta, umbral, total, respuesta } */
export const GET = (request: Request) => lab(request, (deviceId) => labRsvpEstado(deviceId));

/** POST /api/party/lab/rsvp { va, acompanante } → { respuesta } · 403 cerrada · 400 falta_nombre */
export const POST = (request: Request) => lab(request, (deviceId, body) => labRsvp(deviceId, body));

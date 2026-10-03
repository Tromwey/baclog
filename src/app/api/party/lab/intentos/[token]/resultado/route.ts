import { labResultado } from "@/modules/party/lab";
import { lab } from "../../../_lib";

/** POST /api/party/lab/intentos/{token}/resultado { gano, ms } → { sello } (idempotent per token) */
export async function POST(request: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  return lab(request, (deviceId, body) => labResultado(deviceId, token, body));
}

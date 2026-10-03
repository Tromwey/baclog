import { NextResponse } from "next/server";
import { checkRateLimit, clientIp } from "@/authz/rate-limit";
import { labCalendario } from "@/modules/party/lab";

/**
 * GET /api/party/lab/calendario → the party as an .ics file ("Agregar al calendario" at the end of the
 * Mausoleum's credits). A plain link, so no `X-Dispositivo`; it answers only once the group opened the last
 * niche (same rule as the niche's own content), and 404s before that.
 */
export async function GET(request: Request) {
  const rl = checkRateLimit(`party-lab-ip:${clientIp(request)}`, 120);
  if (!rl.ok) return new NextResponse(null, { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } });
  const ics = await labCalendario();
  if (!ics) return new NextResponse(null, { status: 404 });
  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="costume-party.ics"',
      "Cache-Control": "no-store",
    },
  });
}

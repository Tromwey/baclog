import { NextResponse } from "next/server";
import { checkRateLimit, clientIp } from "@/authz/rate-limit";
import { LabError, parseDevice } from "@/modules/party/lab";

/*
 * /api/party/lab/** — the labyrinth's seal server (see modules/party/lab.ts).
 * PUBLIC and anonymous on purpose, like the /party RSVP: no session, the
 * caller is the device id in `X-Dispositivo`. Rate limited by IP (in-memory
 * per instance) because the writes are anonymous.
 */
const PER_IP_PER_MINUTE = 120;

export async function lab(request: Request, run: (deviceId: string, body: Record<string, unknown>) => Promise<unknown>) {
  const rl = checkRateLimit(`party-lab-ip:${clientIp(request)}`, PER_IP_PER_MINUTE);
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } });
  }
  try {
    const deviceId = parseDevice(request.headers.get("x-dispositivo"));
    let body: Record<string, unknown> = {};
    if (request.method !== "GET") {
      const parsed: unknown = await request.json().catch(() => null);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
    }
    return NextResponse.json(await run(deviceId, body), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof LabError) return NextResponse.json({ error: e.code }, { status: e.status });
    console.error("[party-lab]", e);
    return NextResponse.json({ error: "error" }, { status: 500 });
  }
}

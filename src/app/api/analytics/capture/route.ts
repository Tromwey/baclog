import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/auth";
import { recordEvent } from "@/modules/analytics/capture";

// Client beacon path — only for signed-in client actions (card + link share).
// Public page VIEWS are captured server-side in the RSC, not here, so this
// endpoint deliberately accepts a tiny allowlist and requires a session.
const schema = z.object({
  eventType: z.enum(["card_share", "link_share"]),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: true }); // no-op, no oracle

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: true });

  await recordEvent({
    eventType: parsed.data.eventType,
    userId: user.id,
    headers: request.headers,
  });
  return NextResponse.json({ ok: true });
}

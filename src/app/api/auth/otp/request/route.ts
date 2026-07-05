import { NextResponse } from "next/server";
import { z } from "zod";
import { issueOtp, OtpCooldownError } from "@/auth/otp";

const bodySchema = z.object({ email: z.string().email().max(254) });

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }
  try {
    await issueOtp(parsed.data.email);
  } catch (err) {
    if (err instanceof OtpCooldownError) {
      return NextResponse.json({ error: "cooldown" }, { status: 429 });
    }
    throw err;
  }
  return NextResponse.json({ ok: true });
}

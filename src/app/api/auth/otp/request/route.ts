import { NextResponse } from "next/server";
import { z } from "zod";
import { issueOtp, OtpCooldownError } from "@/auth/otp";
import type { OtpRequestRefusal } from "@/auth/otp-policy";
import { checkRateLimit, clientIp } from "@/authz/rate-limit";
import { errorTag } from "@/authz/safe-log";

const bodySchema = z.object({ email: z.string().email().max(254) });

/** Codes one IP may ask for per minute, across ALL emails (in-memory, per
 *  instance — it blunts a script spraying addresses; the per-(email, origin)
 *  cooldown and the hourly caps in `src/auth/otp.ts` are the DB-backed bounds). Its own
 *  bucket, so it never shares quota with the API's `ip:` one. */
const REQUESTS_PER_IP_PER_MINUTE = 10;

/**
 * 429, one shape for the three cases (the same `reason` names as
 * `POST /api/v1/auth/otp/request`, `otp-policy.ts` `OtpRequestRefusal`):
 *   { "error": "cooldown", "reason": "cooldown" | "hourly_cap" | "ip_limit",
 *     "retryAfterSeconds": n }  + `Retry-After: n`
 * `error` stays "cooldown" (the form of an older build reads only the
 * status). ONLY `reason: "cooldown"` means a code is waiting in the inbox.
 */
function tooMany(reason: OtpRequestRefusal, retryAfterSeconds: number) {
  const wait = Math.max(1, Math.ceil(retryAfterSeconds));
  return NextResponse.json(
    { error: "cooldown", reason, retryAfterSeconds: wait },
    { status: 429, headers: { "Retry-After": String(wait), "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: Request) {
  // Before parsing anything: a flood of malformed bodies is still a flood.
  const ip = clientIp(request);
  const rl = checkRateLimit(`otp-req-ip:${ip}`, REQUESTS_PER_IP_PER_MINUTE);
  if (!rl.ok) return tooMany("ip_limit", rl.retryAfterSeconds);

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }
  try {
    await issueOtp(parsed.data.email, ip);
  } catch (err) {
    if (err instanceof OtpCooldownError) return tooMany(err.reason, err.retryAfterSeconds);
    // Never rethrow: Next logs an uncaught error whole, and a failed OTP
    // statement carries the email and the code's hash as params. Name and
    // code only (`safe-log.ts`); the answer is the same 500.
    console.error(`[auth/otp] request failed: ${errorTag(err)}`);
    return NextResponse.json(
      { error: "server_error" },
      { status: 500, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  return NextResponse.json({ ok: true });
}

"use server";

import { cookies, headers } from "next/headers";
import { z } from "zod";
import { checkRateLimit, clientIpOf } from "@/authz/rate-limit";
import { joinWaitlist, waitlistProof } from "@/modules/growth/waitlist";

const schema = z.object({
  email: z.string().email().max(254),
  refCode: z.string().max(12).optional(),
});

/** Joins one network may attempt per minute (in-memory, per instance — it
 *  blunts a script walking a list of addresses; its own bucket). */
const JOINS_PER_IP_PER_MINUTE = 5;

/** httpOnly proof that THIS browser created the entry for an email
 *  (`waitlistProof`). Lets "ya estabas en la fila" show your place again
 *  from the same browser, and nobody else's from anywhere. */
const PROOF_COOKIE = "kura_wl";
const PROOF_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;

/**
 * The ONLY anonymous write besides /party. Returns:
 *   - `{ ok, alreadyJoined: false, position, referralCode, referralCount }`
 *     for an entry created by this call;
 *   - the same with `alreadyJoined: true` for a re-join from the browser that
 *     created it (proof cookie);
 *   - `{ ok, alreadyJoined: true }` — NO position, code or count — for an
 *     email that was already in line and no proof: those are someone's data
 *     and the caller is anonymous;
 *   - `{ error: "invalid" | "rate_limited" }`.
 */
export async function joinWaitlistAction(input: {
  email: string;
  refCode?: string;
}) {
  const ip = clientIpOf(await headers());
  if (!checkRateLimit(`waitlist-ip:${ip}`, JOINS_PER_IP_PER_MINUTE).ok) {
    return { error: "rate_limited" as const };
  }
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: "invalid" as const };

  const jar = await cookies();
  const result = await joinWaitlist(
    parsed.data.email,
    parsed.data.refCode,
    jar.get(PROOF_COOKIE)?.value ?? null,
  );
  if (!result.alreadyJoined) {
    jar.set(PROOF_COOKIE, waitlistProof(parsed.data.email), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: PROOF_MAX_AGE_SECONDS,
    });
  }
  return { ok: true as const, ...result };
}

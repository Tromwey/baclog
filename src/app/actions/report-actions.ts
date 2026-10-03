"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { getCurrentUser } from "@/auth";
import { isOnboarded } from "@/auth/user-row";
import { checkRateLimit, clientIpOf } from "@/authz/rate-limit";
import {
  profileReportBodySchema,
  type ProfileReportReason,
} from "@/modules/reports/types";
import { reportProfile } from "@/modules/reports/write";

const usernameSchema = z.string().min(1).max(30);

/** Profile reports one IP may send per minute, signed in or not (the action
 *  accepts anonymous reports, so the IP is the only key that always exists).
 *  In-memory per instance; the per-reporter limit and the (reporter, target)
 *  dedupe live in `modules/reports/write.ts`. */
const REPORTS_PER_IP_PER_MINUTE = 5;

/**
 * F2.21 — report a public profile. Anonymous reports allowed (public
 * pages have no session); reporter recorded when present. Response is
 * intentionally generic: never confirms whether the username exists — and
 * that includes the rate limit: over it the report is dropped and the answer
 * is the same `{ ok: true }`. The
 * rules live in `modules/reports/write.ts` (shared with
 * `POST /api/v1/people/{handle}/report`).
 *
 * F2.2: a SIGNED-IN reporter must have finished onboarding (name + birth
 * year) — otherwise the report is dropped behind the same `{ ok: true }`.
 * Anonymous reports stay allowed (that is the public page's whole point).
 */
export async function submitReportAction(input: {
  username: string;
  reason: ProfileReportReason;
  details?: string;
}) {
  const username = usernameSchema.safeParse(input.username);
  const body = profileReportBodySchema.safeParse({
    reason: input.reason,
    details: input.details,
  });
  if (!username.success || !body.success) return { ok: true as const };

  const ip = clientIpOf(await headers());
  if (!checkRateLimit(`report-ip:${ip}`, REPORTS_PER_IP_PER_MINUTE).ok) {
    return { ok: true as const };
  }

  const reporter = await getCurrentUser();
  if (reporter && !isOnboarded(reporter)) return { ok: true as const };
  await reportProfile(reporter?.id ?? null, username.data, body.data);
  return { ok: true as const };
}

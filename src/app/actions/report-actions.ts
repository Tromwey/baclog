"use server";

import { z } from "zod";
import { getCurrentUser } from "@/auth";
import {
  profileReportBodySchema,
  type ProfileReportReason,
} from "@/modules/reports/types";
import { reportProfile } from "@/modules/reports/write";

const usernameSchema = z.string().min(1).max(30);

/**
 * F2.21 — report a public profile. Anonymous reports allowed (public
 * pages have no session); reporter recorded when present. Response is
 * intentionally generic: never confirms whether the username exists. The
 * rules live in `modules/reports/write.ts` (shared with
 * `POST /api/v1/people/{handle}/report`).
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

  const reporter = await getCurrentUser();
  await reportProfile(reporter?.id ?? null, username.data, body.data);
  return { ok: true as const };
}

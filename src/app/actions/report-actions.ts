"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getCurrentUser } from "@/auth";
import { db } from "@/db";
import { reportReasonEnum, reports, users } from "@/db/schema";

const schema = z.object({
  username: z.string().min(1).max(30),
  reason: z.enum(reportReasonEnum.enumValues),
  details: z.string().trim().max(500).optional(),
});

/**
 * F2.21 — report a public profile. Anonymous reports allowed (public
 * pages have no session); reporter recorded when present. Response is
 * intentionally generic: never confirms whether the username exists.
 */
export async function submitReportAction(input: {
  username: string;
  reason: (typeof reportReasonEnum.enumValues)[number];
  details?: string;
}) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: true as const };

  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.username, parsed.data.username.toLowerCase()),
        eq(users.isPublic, true),
      ),
    )
    .limit(1);
  if (!target) return { ok: true as const };

  const reporter = await getCurrentUser();
  await db.insert(reports).values({
    reporterUserId: reporter?.id ?? null,
    targetUserId: target.id,
    reason: parsed.data.reason,
    details: parsed.data.details || null,
  });
  return { ok: true as const };
}

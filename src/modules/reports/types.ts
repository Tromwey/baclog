import { z } from "zod";
import {
  REVIEW_REPORT_REASONS,
  type ReviewReportReason,
} from "@/modules/reviews/types";

/**
 * The report bodies (trust & safety). PURE on purpose — no "server-only", no
 * DB: the web actions, `modules/reports/write.ts` and the API's wire contract
 * (`api/v1/_lib/schemas.ts`, which `scripts/check-wire.ts` runs under tsx) all
 * import the SAME schemas, so the accepted reasons can't drift between them.
 */

/** The profile sheet's motives — the first five `report_reason` values (the
 *  review-only ones make no sense for a whole profile). */
export const PROFILE_REPORT_REASONS = [
  "spam",
  "impersonation",
  "harassment",
  "illegal_content",
  "other",
] as const;
export type ProfileReportReason = (typeof PROFILE_REPORT_REASONS)[number];

/** Body of a profile report (the handle travels separately). The API parses
 *  with it (a miss is a 400 with `fields`: a client bug, not an oracle); the
 *  web action safeParses and stays silent. */
export const profileReportBodySchema = z.object({
  reason: z.enum(PROFILE_REPORT_REASONS),
  details: z.string().trim().max(500).optional(),
});
export type ProfileReportBody = z.infer<typeof profileReportBodySchema>;

const REVIEW_REASON_IDS = REVIEW_REPORT_REASONS.map((r) => r.id) as [
  ReviewReportReason,
  ...ReviewReportReason[],
];

/** Body of a review report. Reasons = `REVIEW_REPORT_REASONS` (reviews/types.ts,
 *  the single source of truth the sheet renders). */
export const reviewReportBodySchema = z.object({
  reason: z.enum(REVIEW_REASON_IDS),
});
export type ReviewReportBody = z.infer<typeof reviewReportBodySchema>;


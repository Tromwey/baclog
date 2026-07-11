import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  crossMediaRecs,
  crossMediaRecUsage,
  crossMediaRecoFeedback,
  userItems,
} from "@/db/schema";
import { POSITIVE_REASONS } from "./feedback-reasons";

/**
 * The continuous-improvement readout: reco outcomes aggregated by
 * (promptVersion, model) so a prompt bump is judged on numbers, not vibes.
 * Read by the founder-gated /admin/recos page. Every row here exists because
 * generation stamps promptVersion + model (crossmedia-provider.ts) and
 * feedback denormalizes crossMediaRecId (schema F3.6) — this module is the
 * missing read side of that loop.
 */

export interface RecoVersionMetrics {
  promptVersion: number;
  model: string | null;
  provider: string;
  /** Grounded + persisted recos produced by this version. */
  generated: number;
  /** Acceptances: user_items whose provenance points at one of those recos. */
  accepted: number;
  /** Feedback rows containing at least one positive / one negative chip. */
  feedbackPositive: number;
  feedbackNegative: number;
}

export interface RecoMonthUsage {
  eraKey: string;
  /** Distinct users who charged at least one generation this month. */
  users: number;
  /** Charged generations (the ADR-009 meter). */
  generations: number;
  /** Of those, charged-with-nothing-to-show (grounding miss / already owned). */
  spentNoMatch: number;
}

export async function getRecoVersionMetrics(): Promise<RecoVersionMetrics[]> {
  const rows = await db
    .select({
      promptVersion: crossMediaRecs.promptVersion,
      model: crossMediaRecs.model,
      provider: crossMediaRecs.provider,
      generated: sql<number>`count(distinct ${crossMediaRecs.id})`.mapWith(
        Number,
      ),
      accepted: sql<number>`count(distinct ${userItems.id})`.mapWith(Number),
    })
    .from(crossMediaRecs)
    .leftJoin(userItems, eq(userItems.sourceCrossMediaRecId, crossMediaRecs.id))
    .groupBy(
      crossMediaRecs.promptVersion,
      crossMediaRecs.model,
      crossMediaRecs.provider,
    )
    .orderBy(desc(crossMediaRecs.promptVersion));

  // Chip polarity is aggregated in JS: reasons is a text[] of tag slugs and
  // beta volume is tiny — a plain fetch beats a fragile array-overlap SQL
  // fragment. One feedback row counts once per polarity it contains.
  const feedback = await db
    .select({
      promptVersion: crossMediaRecs.promptVersion,
      model: crossMediaRecs.model,
      provider: crossMediaRecs.provider,
      reasons: crossMediaRecoFeedback.reasons,
    })
    .from(crossMediaRecoFeedback)
    .innerJoin(
      crossMediaRecs,
      eq(crossMediaRecoFeedback.crossMediaRecId, crossMediaRecs.id),
    );

  const positive = new Set<string>(POSITIVE_REASONS);
  const key = (v: number, m: string | null, p: string) => `${v}·${m}·${p}`;
  const byVersion = new Map(
    rows.map((r) => [
      key(r.promptVersion, r.model, r.provider),
      { ...r, feedbackPositive: 0, feedbackNegative: 0 },
    ]),
  );
  for (const f of feedback) {
    const bucket = byVersion.get(key(f.promptVersion, f.model, f.provider));
    if (!bucket) continue;
    if (f.reasons.some((r) => positive.has(r))) bucket.feedbackPositive += 1;
    if (f.reasons.some((r) => !positive.has(r))) bucket.feedbackNegative += 1;
  }
  return [...byVersion.values()];
}

export async function getRecoMonthUsage(): Promise<RecoMonthUsage[]> {
  return db
    .select({
      eraKey: crossMediaRecUsage.eraKey,
      users: sql<number>`count(*)`.mapWith(Number),
      generations:
        sql<number>`coalesce(sum(${crossMediaRecUsage.generations}), 0)`.mapWith(
          Number,
        ),
      spentNoMatch:
        sql<number>`coalesce(sum(${crossMediaRecUsage.spentNoMatch}), 0)`.mapWith(
          Number,
        ),
    })
    .from(crossMediaRecUsage)
    .groupBy(crossMediaRecUsage.eraKey)
    .orderBy(desc(crossMediaRecUsage.eraKey));
}

import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  catalogItems,
  crossMediaRecs,
  crossMediaRecUsage,
} from "@/db/schema";
import { unifiedSearch } from "@/modules/catalog/search";
import {
  crossMediaProvider,
  type CrossMediaProposal,
  type CrossMediaSeed,
} from "./crossmedia-provider";

/**
 * F3.5.5 — the public cross-media reco engine (Baclog's moat surface).
 *
 * Pipeline: cache lookup → meter check → provider proposal → GROUNDING against
 * the catalog → persist. Every stage is here so the provider stays a pure LLM
 * boundary and this file owns cost/abuse control (ADR-009) and the
 * hallucination guard (grounding).
 *
 * PILAR 4: the provider only ever sees item metadata assembled here; no user
 * id or email crosses that boundary. The userId below is used ONLY for the
 * local monthly meter, never sent anywhere.
 */

/** Free-tier monthly LLM generation cap (ADR-009: gate the bonus, not the habit). */
export const MONTHLY_GENERATION_CAP = 20;

export interface CrossMediaReco {
  /** The grounded reco catalog_item — real, addable, link-outable. */
  targetCatalogItemId: string;
  targetTitle: string;
  targetMediaType: "film" | "series" | "album";
  targetByline: string | null;
  targetYear: number | null;
  /** Real cover for in-app display ONLY (ADR-008: never in the export). */
  targetPosterUrl: string | null;
  narrative: {
    hookEyebrow: string;
    hookTitle: string;
    resultEyebrow: string;
    closer: string;
  };
  /** "fixture" | "llm" — provenance for observability. */
  provider: string;
  /** True when served from cache (no generation charged). */
  cached: boolean;
}

/** "2026-07" — matches recap_send / era.ts. */
function eraKey(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

type SeedRow = typeof catalogItems.$inferSelect;

/**
 * Get the cross-media reco for a loved seed item. Returns null when the seed
 * isn't eligible (books/games), the reco can't be grounded, or the user is
 * over their monthly cap with nothing cached.
 *
 * @param seedCatalogItemId the catalog_item the user loved
 * @param userId            for the per-user monthly meter ONLY (never sent to the LLM)
 */
export async function getCrossMediaReco(
  seedCatalogItemId: string,
  userId: string,
): Promise<CrossMediaReco | null> {
  const [seed] = await db
    .select()
    .from(catalogItems)
    .where(eq(catalogItems.id, seedCatalogItemId))
    .limit(1);
  if (!seed) return null;

  // Direction scope: only cine/series/album have a catalog (books/games out).
  if (
    seed.mediaType !== "film" &&
    seed.mediaType !== "series" &&
    seed.mediaType !== "album"
  ) {
    return null;
  }

  // 1) Cache by seed — an identical seed never pays for a second generation.
  const cachedReco = await readCache(seedCatalogItemId);
  if (cachedReco) return cachedReco;

  // 2) Meter CHECK (read-only): block before generating if already at the cap.
  //    Cache hits above never reach here, so re-viewing a cached reco is free.
  if ((await remainingGenerations(userId)) <= 0) return null;

  // 3) Provider proposes (fixture or real LLM). Only metadata crosses.
  const provider = crossMediaProvider();
  const seedMeta: CrossMediaSeed = {
    title: seed.title,
    mediaType: seed.mediaType,
    byline: seed.byline,
    year: seed.year,
    genre: seed.genre,
  };
  const proposal = await provider.propose(seedMeta);
  // A transient failure (429/network) or unusable output returns null WITHOUT
  // charging — the user isn't penalized for a generation that never happened.
  if (!proposal) return null;

  // 4) Charge the meter now that a real generation was produced (race-safe
  //    upsert with a cap guard; a concurrent pair may exceed by one — soft cap).
  await tryChargeGeneration(userId);

  // 5) GROUNDING (mandatory): resolve the proposed title against the catalog.
  //    Only a real, addable catalog_item is surfaced (LLMs hallucinate titles).
  const grounded = await groundProposal(proposal);
  if (!grounded) return null;

  // 6) Persist the grounded reco keyed by seed (idempotent on the unique index).
  const [row] = await db
    .insert(crossMediaRecs)
    .values({
      seedCatalogItemId,
      targetCatalogItemId: grounded.id,
      hookEyebrow: proposal.narrative.hookEyebrow,
      hookTitle: proposal.narrative.hookTitle,
      resultEyebrow: proposal.narrative.resultEyebrow,
      closer: proposal.narrative.closer,
      provider: provider.id,
    })
    .onConflictDoNothing({ target: crossMediaRecs.seedCatalogItemId })
    .returning();

  // A concurrent request may have won the insert — fall back to the cached row.
  if (!row) return (await readCache(seedCatalogItemId)) ?? null;

  return toReco(proposal, grounded, provider.id, false);
}

/** Read a cached reco (with its grounded target) for a seed, if any. */
async function readCache(seedCatalogItemId: string): Promise<CrossMediaReco | null> {
  const [hit] = await db
    .select({
      hookEyebrow: crossMediaRecs.hookEyebrow,
      hookTitle: crossMediaRecs.hookTitle,
      resultEyebrow: crossMediaRecs.resultEyebrow,
      closer: crossMediaRecs.closer,
      provider: crossMediaRecs.provider,
      target: catalogItems,
    })
    .from(crossMediaRecs)
    .innerJoin(
      catalogItems,
      eq(crossMediaRecs.targetCatalogItemId, catalogItems.id),
    )
    .where(eq(crossMediaRecs.seedCatalogItemId, seedCatalogItemId))
    .limit(1);
  if (!hit) return null;

  return {
    targetCatalogItemId: hit.target.id,
    targetTitle: hit.target.title,
    targetMediaType: hit.target.mediaType,
    targetByline: hit.target.byline,
    targetYear: hit.target.year,
    targetPosterUrl: hit.target.posterUrl,
    narrative: {
      hookEyebrow: hit.hookEyebrow,
      hookTitle: hit.hookTitle,
      resultEyebrow: hit.resultEyebrow,
      closer: hit.closer ?? "",
    },
    provider: hit.provider,
    cached: true,
  };
}

/**
 * Atomically bump the user's monthly generation counter, returning false if
 * the bump would exceed the cap (ADR-009 abuse/cost guard). Uses an upsert with
 * a guarded increment so it's race-safe under concurrent requests.
 */
async function tryChargeGeneration(userId: string): Promise<boolean> {
  const key = eraKey();
  const [row] = await db
    .insert(crossMediaRecUsage)
    .values({ userId, eraKey: key, generations: 1 })
    .onConflictDoUpdate({
      target: [crossMediaRecUsage.userId, crossMediaRecUsage.eraKey],
      set: {
        generations: sql`${crossMediaRecUsage.generations} + 1`,
        updatedAt: sql`now()`,
      },
      // Only bump while still under the cap — over-cap rows are left untouched.
      setWhere: sql`${crossMediaRecUsage.generations} < ${MONTHLY_GENERATION_CAP}`,
    })
    .returning({ generations: crossMediaRecUsage.generations });

  // No returned row = the guarded update matched nothing (already at cap).
  return Boolean(row);
}

/**
 * Ground a proposed title to a real catalog_item. Reuses unifiedSearch (which
 * also warms the shared cache), picking the first result of the target media
 * type. Tries a byline-biased query first (tighter match), then the bare title
 * (iTunes/TMDB are strict about extra tokens — commas + artist names can zero
 * out an otherwise-real album). Returns null when nothing resolves — the reco
 * is then dropped (the hallucination guard: prose can be the LLM's, the item
 * must be real).
 */
async function groundProposal(
  proposal: CrossMediaProposal,
): Promise<SeedRow | null> {
  const queries = [
    [proposal.targetTitle, proposal.targetByline].filter(Boolean).join(" "),
    proposal.targetTitle,
  ].filter((q, i, a) => q && a.indexOf(q) === i);

  for (const query of queries) {
    let results;
    try {
      results = await unifiedSearch(query, proposal.targetMediaType);
    } catch (err) {
      console.error("[crossmedia] grounding search failed:", err);
      continue;
    }
    const match = results.find((r) => r.mediaType === proposal.targetMediaType);
    if (!match) continue;

    const [row] = await db
      .select()
      .from(catalogItems)
      .where(eq(catalogItems.id, match.catalogItemId))
      .limit(1);
    if (row) return row;
  }
  return null;
}

function toReco(
  proposal: CrossMediaProposal,
  target: SeedRow,
  providerId: string,
  cached: boolean,
): CrossMediaReco {
  return {
    targetCatalogItemId: target.id,
    targetTitle: target.title,
    targetMediaType: target.mediaType,
    targetByline: target.byline,
    targetYear: target.year,
    targetPosterUrl: target.posterUrl,
    narrative: proposal.narrative,
    provider: providerId,
    cached,
  };
}

/** Remaining generations this month for a user (for UI / meter display). */
export async function remainingGenerations(userId: string): Promise<number> {
  const [row] = await db
    .select({ generations: crossMediaRecUsage.generations })
    .from(crossMediaRecUsage)
    .where(
      and(
        eq(crossMediaRecUsage.userId, userId),
        eq(crossMediaRecUsage.eraKey, eraKey()),
      ),
    )
    .limit(1);
  return Math.max(0, MONTHLY_GENERATION_CAP - (row?.generations ?? 0));
}

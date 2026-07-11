import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  catalogItems,
  crossMediaRecs,
  crossMediaRecUsage,
  userItems,
} from "@/db/schema";
import { unifiedSearch } from "@/modules/catalog/search";
import { getLovedSeeds, type LovedSeed } from "@/modules/backlog/queries";
import {
  crossMediaProvider,
  CURRENT_PROMPT_VERSION,
  NARRATE_PROMPT_VERSION,
  type CrossMediaProposal,
  type CrossMediaSeed,
} from "./crossmedia-provider";
import {
  buildLinkClaim,
  getOrMaterializeLinkEdges,
  rankEdgesForUser,
  type CatalogItemRow as GraphCatalogItemRow,
  type CrossMediaLinkType,
  type RankedTarget,
} from "./linkgraph";

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

/**
 * Outcome of resolving a single reco. Splits apart what used to collapse to
 * `null`:
 *   - `ok`             — a grounded, addable reco (cached or freshly generated).
 *   - `empty`          — a LEGITIMATE no-result that NEVER charged the meter:
 *                        ineligible seed, cap reached (pre-charge check or the
 *                        cap-race guard), or a concurrent insert we couldn't
 *                        re-read. Nothing to retry, nothing was spent.
 *   - `spent_no_match` — the meter WAS charged (ADR-009: the LLM call is billed
 *                        regardless of grounding) and the provider returned a
 *                        usable proposal, but its title didn't ground to a real
 *                        catalog item. A discovery was spent with nothing to
 *                        show — surfaced (not silent) so the user knows, and a
 *                        re-roll may ground.
 *   - `failed`         — a TRANSIENT generation failure (provider 429/network/
 *                        timeout or unusable output). Retryable, and net-zero on
 *                        the meter (charged up front for race safety, refunded
 *                        on the failure).
 * The UI surfaces `failed` and `spent_no_match` with a retry affordance (the
 * latter being explicit that an intento was spent); `empty` keeps its existing
 * quiet copy.
 */
export type RecoResult =
  | { status: "ok"; reco: CrossMediaReco }
  | { status: "empty" }
  | { status: "spent_no_match" }
  | { status: "failed" };

/** "2026-07" — matches recap_send / era.ts. */
function eraKey(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

type SeedRow = typeof catalogItems.$inferSelect;

/**
 * Get the cross-media reco for a loved seed item.
 *
 * Returns a discriminated {@link RecoResult} so callers can tell a TRANSIENT
 * generation failure (`failed` — provider 429/network/unusable output) apart
 * from a LEGITIMATE empty (`empty` — ineligible seed, cap reached with nothing
 * cached, or a proposal that didn't ground). A `failed` never charges the meter.
 *
 * @param seedCatalogItemId the catalog_item the user loved
 * @param userId            for the per-user monthly meter ONLY (never sent to the LLM)
 */
export async function getCrossMediaReco(
  seedCatalogItemId: string,
  userId: string,
): Promise<RecoResult> {
  const [seed] = await db
    .select()
    .from(catalogItems)
    .where(eq(catalogItems.id, seedCatalogItemId))
    .limit(1);
  if (!seed) return { status: "empty" };

  // Direction scope: only cine/series/album have a catalog (books/games out).
  if (
    seed.mediaType !== "film" &&
    seed.mediaType !== "series" &&
    seed.mediaType !== "album"
  ) {
    return { status: "empty" };
  }

  // F3.5.8 GRAPH PATH (retrieve→narrate), tried first: materialize the seed's
  // verified edges (lazy, never metered — same cost class as the old grounding
  // step) and rank them for THIS user (taste = deterministic selection, no
  // LLM). Any usable candidate means the pairing is real by construction and
  // already ownership-filtered; the LLM is only asked for prose.
  const edges = await getOrMaterializeLinkEdges(seed);
  const ranked = await rankEdgesForUser(userId, seed, edges);
  if (ranked.length > 0) {
    return graphPathReco(seed, ranked, userId);
  }

  // DEEP-CUT FALLBACK (v2 propose+ground, stamped "thematic"): no edges, or
  // every edge target already owned. Honest degradation — the model may only
  // offer a thematic connection here, and the row records that.

  // 1) Thematic cache (per-seed singleton, cross-user): serve free unless the
  //    target is already in THIS user's library (read-time library check).
  const cachedReco = await readCacheAnyThematic(seedCatalogItemId);
  if (cachedReco) {
    if (await userOwnsItem(userId, cachedReco.targetCatalogItemId)) {
      return { status: "empty" };
    }
    return { status: "ok", reco: cachedReco };
  }

  // 2) Charge the meter FIRST (race-safe hard cap): the guarded upsert admits
  //    at most cap generations, so N concurrent requests can no longer all
  //    reach the provider on a stale read-only pre-check (LLM-cost/quota
  //    amplification). A transient provider failure REFUNDS the charge below,
  //    preserving ADR-009's "never penalized for a generation that never
  //    happened" — while grounding/owned misses stay charged (the LLM call
  //    cost real money).
  if (!(await tryChargeGeneration(userId))) return { status: "empty" };

  // 3) Provider proposes (fixture or real LLM). Only metadata crosses —
  //    excludeTitles are bare catalog titles from the user's library in the
  //    TARGET family (Pilar 4 holds: no user id, no PII), so the model never
  //    proposes something the user already owns.
  const provider = crossMediaProvider();
  const targetFamily: ("film" | "series" | "album")[] =
    seed.mediaType === "album" ? ["film", "series"] : ["album"];
  const seedMeta: CrossMediaSeed = {
    title: seed.title,
    mediaType: seed.mediaType,
    byline: seed.byline,
    year: seed.year,
    genre: seed.genre,
    excludeTitles: await libraryTitles(userId, targetFamily),
  };
  const outcome = await provider.propose(seedMeta);
  // 4) A transient failure (429/network) or unusable output → `failed`, and the
  //    step-2 charge is refunded: net-zero on the meter, distinct from the
  //    `empty` cases (no reco to show).
  if (!outcome.ok) {
    await refundGeneration(userId);
    return { status: "failed" };
  }
  const proposal = outcome.proposal;

  // 5) GROUNDING (mandatory): resolve the proposed title against the catalog.
  //    Only a real, addable catalog_item is surfaced (LLMs hallucinate titles).
  //    We already CHARGED above (step 2, ADR-009 — the LLM call cost money), so a
  //    grounding miss here is `spent_no_match`, NOT `empty`: a discovery was
  //    spent with nothing to show. Surfacing it (vs. the old silent `empty`) lets
  //    the UI tell the user and offer a re-roll that may ground.
  const grounded = await groundProposal(proposal);
  if (!grounded) {
    await recordSpentNoMatch(userId);
    return { status: "spent_no_match" };
  }

  // 5b) LIBRARY CHECK: a grounded reco the user already owns is also nothing
  //     to show (the <exclude> block makes this rare; this is the deterministic
  //     backstop for when the model ignores it). NOT persisted — the global
  //     per-seed cache would permanently pin an already-owned pairing for this
  //     user; a re-roll with the exclusion list can still find another link.
  if (await userOwnsItem(userId, grounded.id)) {
    await recordSpentNoMatch(userId);
    return { status: "spent_no_match" };
  }

  // 6) Persist the thematic reco. Bare onConflictDoNothing (any constraint):
  //    a concurrent request may have won either the thematic-singleton partial
  //    index or the (seed, target) pair unique — both resolve to "re-read".
  const [row] = await db
    .insert(crossMediaRecs)
    .values({
      seedCatalogItemId,
      targetCatalogItemId: grounded.id,
      hookEyebrow: proposal.narrative.hookEyebrow,
      hookTitle: proposal.narrative.hookTitle,
      resultEyebrow: proposal.narrative.resultEyebrow,
      closer: proposal.narrative.closer,
      linkClaim: proposal.linkClaim,
      linkType: "thematic",
      provider: provider.id,
      promptVersion: CURRENT_PROMPT_VERSION,
      model: provider.model,
    })
    .onConflictDoNothing()
    .returning();

  // A concurrent request may have won the insert — fall back to the cached row.
  if (!row) {
    const cached = await readCacheAnyThematic(seedCatalogItemId);
    return cached ? { status: "ok", reco: cached } : { status: "empty" };
  }

  return { status: "ok", reco: toReco(proposal, grounded, provider.id, false) };
}

/**
 * F3.5.8 graph path: serve a cached narration for any ranked pair (free), or
 * narrate the best-ranked edge (metered). The target is a real catalog_item
 * and already ownership-filtered — no grounding, no post-hoc library check;
 * spent_no_match can't happen here outside a hairline TOCTOU (user adds the
 * target mid-request), which we accept: the row still serves everyone else.
 */
async function graphPathReco(
  seed: GraphCatalogItemRow,
  ranked: RankedTarget[],
  userId: string,
): Promise<RecoResult> {
  // Cache-first across ALL ranked pairs, best first: an already-narrated
  // pairing is free, and free beats regenerating (ADR-009) even when it isn't
  // the top-ranked edge today.
  for (const candidate of ranked) {
    const cached = await readCacheForPair(seed.id, candidate.target.id);
    if (cached) return { status: "ok", reco: cached };
  }

  const best = ranked[0];
  if (!(await tryChargeGeneration(userId))) return { status: "empty" };

  const meta = (best.edge.meta ?? {}) as { composer?: string; artist?: string };
  const creatorName = meta.composer ?? meta.artist ?? null;
  const videoTitle = seed.mediaType === "album" ? best.target.title : seed.title;
  const albumTitle = seed.mediaType === "album" ? seed.title : best.target.title;
  const linkType = best.edge.linkType as CrossMediaLinkType;
  const linkClaim = buildLinkClaim(linkType, videoTitle, albumTitle, creatorName);

  const provider = crossMediaProvider();
  const outcome = await provider.narrate(
    {
      title: seed.title,
      mediaType: seed.mediaType,
      byline: seed.byline,
      year: seed.year,
      genre: seed.genre,
    },
    {
      title: best.target.title,
      mediaType: best.target.mediaType,
      byline: best.target.byline,
      year: best.target.year,
    },
    { linkType, linkClaim, creatorName },
  );
  if (!outcome.ok) {
    await refundGeneration(userId);
    return { status: "failed" };
  }

  const [row] = await db
    .insert(crossMediaRecs)
    .values({
      seedCatalogItemId: seed.id,
      targetCatalogItemId: best.target.id,
      hookEyebrow: outcome.narrative.hookEyebrow,
      hookTitle: outcome.narrative.hookTitle,
      resultEyebrow: outcome.narrative.resultEyebrow,
      closer: outcome.narrative.closer,
      linkClaim,
      linkType,
      crossMediaLinkId: best.edge.id,
      provider: provider.id,
      promptVersion: NARRATE_PROMPT_VERSION,
      model: provider.model,
    })
    .onConflictDoNothing()
    .returning();

  if (!row) {
    const cached = await readCacheForPair(seed.id, best.target.id);
    return cached ? { status: "ok", reco: cached } : { status: "empty" };
  }

  return {
    status: "ok",
    reco: {
      targetCatalogItemId: best.target.id,
      targetTitle: best.target.title,
      targetMediaType: best.target.mediaType,
      targetByline: best.target.byline,
      targetYear: best.target.year,
      targetPosterUrl: best.target.posterUrl,
      narrative: outcome.narrative,
      provider: provider.id,
      cached: false,
    },
  };
}

/** Shared select shape for all cache readers (rec row + joined target). */
const CACHE_SELECT = {
  hookEyebrow: crossMediaRecs.hookEyebrow,
  hookTitle: crossMediaRecs.hookTitle,
  resultEyebrow: crossMediaRecs.resultEyebrow,
  closer: crossMediaRecs.closer,
  provider: crossMediaRecs.provider,
  linkType: crossMediaRecs.linkType,
  createdAt: crossMediaRecs.createdAt,
  target: catalogItems,
} as const;

type CacheHit = {
  hookEyebrow: string;
  hookTitle: string;
  resultEyebrow: string;
  closer: string | null;
  provider: string;
  linkType: string | null;
  createdAt: Date;
  target: typeof catalogItems.$inferSelect;
};

function toCachedReco(hit: CacheHit): CrossMediaReco {
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

/** Cached narration for one exact (seed, target) pair — the graph-path key. */
async function readCacheForPair(
  seedCatalogItemId: string,
  targetCatalogItemId: string,
): Promise<CrossMediaReco | null> {
  const [hit] = await db
    .select(CACHE_SELECT)
    .from(crossMediaRecs)
    .innerJoin(
      catalogItems,
      eq(crossMediaRecs.targetCatalogItemId, catalogItems.id),
    )
    .where(
      and(
        eq(crossMediaRecs.seedCatalogItemId, seedCatalogItemId),
        eq(crossMediaRecs.targetCatalogItemId, targetCatalogItemId),
      ),
    )
    .limit(1);
  return hit ? toCachedReco(hit) : null;
}

/** The seed's thematic/legacy singleton (deep-cut path), if any. */
async function readCacheAnyThematic(
  seedCatalogItemId: string,
): Promise<CrossMediaReco | null> {
  const [hit] = await db
    .select(CACHE_SELECT)
    .from(crossMediaRecs)
    .innerJoin(
      catalogItems,
      eq(crossMediaRecs.targetCatalogItemId, catalogItems.id),
    )
    .where(
      and(
        eq(crossMediaRecs.seedCatalogItemId, seedCatalogItemId),
        sql`${crossMediaRecs.linkType} is null or ${crossMediaRecs.linkType} = 'thematic'`,
      ),
    )
    .limit(1);
  return hit ? toCachedReco(hit) : null;
}

/**
 * Every cached reco for a seed, graph rows before thematic/legacy, newest
 * first within each group — feed readers pick the first the user doesn't own.
 */
async function readCacheCandidates(
  seedCatalogItemId: string,
): Promise<CrossMediaReco[]> {
  const hits = await db
    .select(CACHE_SELECT)
    .from(crossMediaRecs)
    .innerJoin(
      catalogItems,
      eq(crossMediaRecs.targetCatalogItemId, catalogItems.id),
    )
    .where(eq(crossMediaRecs.seedCatalogItemId, seedCatalogItemId));
  return hits
    .sort((a, b) => {
      const aThematic = a.linkType === null || a.linkType === "thematic" ? 1 : 0;
      const bThematic = b.linkType === null || b.linkType === "thematic" ? 1 : 0;
      return (
        aThematic - bThematic || b.createdAt.getTime() - a.createdAt.getTime()
      );
    })
    .map(toCachedReco);
}

/**
 * Resolve a cached rec's own row id for a (seed, target) pair, for provenance
 * stamping (F3.6: backlogItems.sourceCrossMediaRecId). Server-side lookup, not
 * client-threaded — crossMediaRecs is a shared, non-user-scoped cache, so an id
 * handed up by the client couldn't be trusted without re-validating against
 * this same pair anyway. Cheap: seedCatalogItemId already has a unique index.
 */
export async function getCrossMediaRecId(
  seedCatalogItemId: string,
  targetCatalogItemId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ id: crossMediaRecs.id })
    .from(crossMediaRecs)
    .where(
      and(
        eq(crossMediaRecs.seedCatalogItemId, seedCatalogItemId),
        eq(crossMediaRecs.targetCatalogItemId, targetCatalogItemId),
      ),
    )
    .limit(1);
  return row?.id ?? null;
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

/** Whether the user already has this title in their library (any backlog). */
async function userOwnsItem(
  userId: string,
  catalogItemId: string,
): Promise<boolean> {
  const [owned] = await db
    .select({ id: userItems.id })
    .from(userItems)
    .where(
      and(
        eq(userItems.userId, userId),
        eq(userItems.catalogItemId, catalogItemId),
      ),
    )
    .limit(1);
  return Boolean(owned);
}

/**
 * Undo a generation charge after a TRANSIENT provider failure (the call never
 * produced anything billable). Charging first + refunding here is what makes
 * the cap race-safe: the guarded upsert in tryChargeGeneration admits at most
 * `cap` concurrent generations, instead of the old read-only pre-check that N
 * concurrent requests could all pass before any charge landed (provider-call
 * amplification). Grounding/owned misses are NOT refunded — ADR-009 bills the
 * LLM call regardless of what it yielded.
 */
async function refundGeneration(userId: string): Promise<void> {
  await db
    .update(crossMediaRecUsage)
    .set({
      generations: sql`greatest(${crossMediaRecUsage.generations} - 1, 0)`,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(crossMediaRecUsage.userId, userId),
        eq(crossMediaRecUsage.eraKey, eraKey()),
      ),
    );
}

/**
 * The user's library titles in a media family, newest first, capped — the
 * <exclude> block for the provider. Bare titles only (Pilar 4: item metadata,
 * never PII). The 40-title cap matches the provider's own defensive cap.
 */
async function libraryTitles(
  userId: string,
  family: ("film" | "series" | "album")[],
): Promise<string[]> {
  const rows = await db
    .select({ title: catalogItems.title })
    .from(userItems)
    .innerJoin(catalogItems, eq(userItems.catalogItemId, catalogItems.id))
    .where(
      and(
        eq(userItems.userId, userId),
        inArray(catalogItems.mediaType, family),
      ),
    )
    .orderBy(desc(userItems.addedAt))
    .limit(40);
  return rows.map((r) => r.title);
}

/**
 * Count a charged-but-nothing-to-show generation (grounding miss or an
 * already-owned target) on the month's meter row — the reco-health signal
 * /admin/recos reads. The row always exists here: tryChargeGeneration just
 * upserted it.
 */
async function recordSpentNoMatch(userId: string): Promise<void> {
  await db
    .update(crossMediaRecUsage)
    .set({
      spentNoMatch: sql`${crossMediaRecUsage.spentNoMatch} + 1`,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(crossMediaRecUsage.userId, userId),
        eq(crossMediaRecUsage.eraKey, eraKey()),
      ),
    );
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

/* ============================================================
   F3.5.6 — /para-ti feed: the cross-media reco as a first-class destination.
   Reuses this same engine (cache readers · getCrossMediaReco · remainingGenerations)
   over the user's LOVED seeds, so the cap, per-seed cache, grounding, and
   provider selection stay exactly as shipped for the item page.
   ============================================================ */

/** One Double Feature in the feed: a loved seed + its grounded reco. */
export interface CrossMediaFeedItem {
  seed: {
    catalogItemId: string;
    title: string;
    type: "film" | "series" | "album";
    byline: string | null;
    year: number | null;
    /** Real cover for in-app display ONLY (ADR-008: never in the export). */
    posterUrl: string | null;
  };
  reco: CrossMediaReco;
  /** The seed's home backlog — the default accept target (its Side A backlog). */
  defaultBacklog: { id: string; name: string };
}

export interface CrossMediaFeed {
  items: CrossMediaFeedItem[];
  /** Remaining monthly generations (meter display). */
  remaining: number;
  cap: number;
  /** False → the user has no eligible loved items yet (clean empty state). */
  hasLovedItems: boolean;
  /**
   * True when the single bounded first-load generation hit a TRANSIENT failure
   * (provider error / unusable output) and produced nothing — distinct from a
   * legitimate empty (nothing cached yet, or cap reached). Only ever set when
   * `items` is empty.
   */
  generationFailed: boolean;
  /**
   * True when the single bounded first-load generation WAS charged (ADR-009 bills
   * the LLM call) but its proposal didn't ground to a real catalog item — a
   * discovery spent with nothing to show. Distinct from `generationFailed` (a
   * no-charge transient error) and from a quiet empty. Only ever set when `items`
   * is empty.
   */
  spentNoMatch: boolean;
}

function toFeedItem(seed: LovedSeed, reco: CrossMediaReco): CrossMediaFeedItem {
  return {
    seed: {
      catalogItemId: seed.catalogItemId,
      title: seed.title,
      type: seed.mediaType,
      byline: seed.byline,
      year: seed.year,
      posterUrl: seed.posterUrl,
    },
    reco,
    defaultBacklog: { id: seed.backlogId, name: seed.backlogName },
  };
}

/**
 * Build the /para-ti feed. CACHE-FIRST: every already-generated pairing is free
 * to show (re-visits never charge). To satisfy "renders ≥1 from loved items" on
 * a first visit, spends AT MOST ONE generation — on the most-recent loved seed —
 * and only when under the cap. That single bounded attempt keeps a first load
 * from bursting the meter; more pairings come from the explicit "discover
 * another" action (generateNextUncachedReco).
 */
export async function getCrossMediaFeed(userId: string): Promise<CrossMediaFeed> {
  const cap = MONTHLY_GENERATION_CAP;
  const seeds = await getLovedSeeds(userId);
  if (seeds.length === 0) {
    return {
      items: [],
      remaining: await remainingGenerations(userId),
      cap,
      hasLovedItems: false,
      generationFailed: false,
      spentNoMatch: false,
    };
  }

  // Cache-first read: a seed may now have SEVERAL cached pairings (F3.5.8 —
  // one per narrated edge, plus at most one thematic). Per seed, show the
  // first candidate whose target THIS user doesn't own (graph rows rank ahead
  // of thematic; ownership resolved in one batched query — the read-time
  // library check for the shared cross-user cache).
  const seedCandidates: { seed: LovedSeed; recos: CrossMediaReco[] }[] = [];
  for (const seed of seeds) {
    const recos = await readCacheCandidates(seed.catalogItemId);
    if (recos.length > 0) seedCandidates.push({ seed, recos });
  }
  const allTargetIds = [
    ...new Set(
      seedCandidates.flatMap((s) => s.recos.map((r) => r.targetCatalogItemId)),
    ),
  ];
  const ownedTargets = new Set(
    allTargetIds.length === 0
      ? []
      : (
          await db
            .select({ catalogItemId: userItems.catalogItemId })
            .from(userItems)
            .where(
              and(
                eq(userItems.userId, userId),
                inArray(userItems.catalogItemId, allTargetIds),
              ),
            )
        ).map((r) => r.catalogItemId),
  );
  const items: CrossMediaFeedItem[] = seedCandidates.flatMap(({ seed, recos }) => {
    const pick = recos.find((r) => !ownedTargets.has(r.targetCatalogItemId));
    return pick ? [toFeedItem(seed, pick)] : [];
  });

  // Nothing cached yet → one bounded generation so the page is never empty for
  // a user who has loved items and meter left. A transient provider failure is
  // flagged (not swallowed) so the UI can offer a retry instead of a dead end;
  // likewise a charged-but-ungrounded miss (spent_no_match) is surfaced, not
  // swallowed into the quiet pending empty.
  let generationFailed = false;
  let spentNoMatch = false;
  if (items.length === 0 && (await remainingGenerations(userId)) > 0) {
    const res = await getCrossMediaReco(seeds[0].catalogItemId, userId);
    if (res.status === "ok") items.push(toFeedItem(seeds[0], res.reco));
    else if (res.status === "failed") generationFailed = true;
    else if (res.status === "spent_no_match") spentNoMatch = true;
  }

  return {
    items,
    remaining: await remainingGenerations(userId),
    cap,
    hasLovedItems: true,
    generationFailed,
    spentNoMatch,
  };
}

/**
 * Outcome of an explicit "discover another connection" request.
 *   - `failed`         — a TRANSIENT generation failure (retryable), NEVER charged.
 *   - `spent_no_match` — a generation WAS charged but its proposal didn't ground
 *                        to a real catalog item (ADR-009 charges the LLM call
 *                        regardless). Retryable, but the UI is explicit that an
 *                        intento was spent — distinct from the quiet `no_more`.
 *   - `no_more`        — nothing left to generate (all seeds cached, no seeds, or
 *                        a rare cap-race that charged nothing): a quiet dead end.
 *   - `cap_reached`    — the monthly meter is exhausted (nothing generated).
 */
export type DiscoverResult =
  | "generated"
  | "cap_reached"
  | "no_more"
  | "spent_no_match"
  | "failed";

/**
 * User-initiated generation for the /para-ti "discover another" button. Finds
 * the first loved seed with no cached pairing and spends ONE generation on it
 * (getCrossMediaReco enforces cap + grounding). Bounded to a single seed per
 * call so the meter only moves on deliberate taps.
 *
 * Returns the `seedCatalogItemId` it generated for on `result === "generated"`
 * (null otherwise) so the caller can land on exactly that pairing after a
 * cache-first re-read — getCrossMediaFeed orders items by seed, not append
 * order, so a positional guess would land on the wrong one.
 */
export async function generateNextUncachedReco(
  userId: string,
): Promise<{ result: DiscoverResult; seedCatalogItemId: string | null }> {
  const seeds = await getLovedSeeds(userId);
  if (seeds.length === 0) return { result: "no_more", seedCatalogItemId: null };

  // "Uncached" is now per-USER (F3.5.8): a seed whose every cached candidate
  // targets something this user already owns still deserves a generation —
  // the graph path can narrate a different edge for them.
  let nextUncached: LovedSeed | null = null;
  for (const seed of seeds) {
    const candidates = await readCacheCandidates(seed.catalogItemId);
    if (candidates.length === 0) {
      nextUncached = seed;
      break;
    }
    const targetIds = candidates.map((c) => c.targetCatalogItemId);
    const owned = await db
      .select({ catalogItemId: userItems.catalogItemId })
      .from(userItems)
      .where(
        and(
          eq(userItems.userId, userId),
          inArray(userItems.catalogItemId, targetIds),
        ),
      );
    if (owned.length === targetIds.length) {
      nextUncached = seed;
      break;
    }
  }
  if (!nextUncached) return { result: "no_more", seedCatalogItemId: null };
  if ((await remainingGenerations(userId)) <= 0)
    return { result: "cap_reached", seedCatalogItemId: null };

  const res = await getCrossMediaReco(nextUncached.catalogItemId, userId);
  if (res.status === "ok")
    return { result: "generated", seedCatalogItemId: nextUncached.catalogItemId };
  if (res.status === "failed") return { result: "failed", seedCatalogItemId: null };
  // Charged, proposal ok, but grounding missed → surface it (not silent) so the
  // user learns a discovery was spent; a re-roll may ground. Distinct from both
  // the no-charge `failed` and the quiet `no_more`.
  if (res.status === "spent_no_match")
    return { result: "spent_no_match", seedCatalogItemId: null };
  // `empty` here = a rare cap race that charged nothing (the pre-check at the top
  // saw meter left, the guarded upsert then found the cap full): no reco to show,
  // not a retryable error — keep the quiet "nothing more" path.
  return { result: "no_more", seedCatalogItemId: null };
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

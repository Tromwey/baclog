import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  catalogItems,
  crossMediaRecs,
  crossMediaRecSeen,
  crossMediaRecUsage,
  userItems,
  users,
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
  isNonPrimaryVideoTitle,
  rankEdgesForUser,
  type CatalogItemRow as GraphCatalogItemRow,
  type CrossMediaLinkType,
  type RankedTarget,
} from "./linkgraph";
import { screenNarrative } from "./moderation";
import { logLlmCall, type LlmCallOutcome } from "./telemetry";

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

/**
 * Operator cap. The account that TUNES the engine (prompt iterations, eval
 * runs, QA of a new link type) burns generations at a rate the free-tier gate
 * was never meant to allow, and hitting the wall mid-QA blocks the work rather
 * than the abuse. Gated on `users.isAdmin` — the manually-assigned OPERATOR
 * role — and NOT on `isFounder`, the badge F3.2 auto-grants to the first ~100
 * accounts (that would hand the whole cohort an uncapped LLM budget). Still
 * finite: the meter stays a cost guard, it just isn't the free-tier one here.
 */
export const ADMIN_GENERATION_CAP = 500;

/**
 * The monthly cap that applies to THIS user. One indexed PK lookup on the paths
 * that already hit the DB for the meter anyway.
 */
async function capForUser(userId: string): Promise<number> {
  const [row] = await db
    .select({ isAdmin: users.isAdmin })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.isAdmin ? ADMIN_GENERATION_CAP : MONTHLY_GENERATION_CAP;
}

export interface CrossMediaReco {
  /**
   * The cross_media_rec row id. Needed by the caller so it can stamp the
   * per-user seen/dismissed ledger (F3.5.9) for exactly the pairing it showed.
   */
  recId: string;
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
  /**
   * F3.5.8 — the honesty label: "factual" when the pairing narrates a
   * verified graph edge (soundtrack/score/…), "thematic" when it came from
   * the deep-cut propose path (or a pre-graph legacy row). The card renders
   * this so a real link and a vibe are never dressed the same.
   */
  linkKind: "factual" | "thematic";
  /** True when served from cache (no generation charged). */
  cached: boolean;
  /**
   * F3.5.9 — this user has already been shown this pairing at least once.
   * A seen reco is still served (free beats generating), just AFTER every
   * unseen one; dismissed pairings never make it this far.
   */
  seen: boolean;
}

/** Graph edges narrate facts; thematic/legacy rows are honest vibes. */
function linkKindOf(linkType: string | null): "factual" | "thematic" {
  return linkType && linkType !== "thematic" ? "factual" : "thematic";
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

/** "2026-07" — matches recap_send / era.ts. Exported as THE canonical current
 *  era key: admin/metrics.ts must bucket by the exact strings this module
 *  writes into cross_media_rec_usage.era_key, so there is one copy. */
export function eraKey(now = new Date()): string {
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
 * F3.5.9 — a seed is no longer a one-reco dead end. The cache is ranked FOR
 * THIS USER (owned/dismissed dropped, unseen before seen), and when nothing
 * unseen is left an explicit re-roll (`forceNew`) narrates the next-best graph
 * edge, or generates another deep cut. The monthly meter is the only ceiling.
 *
 * @param seedCatalogItemId the catalog_item the user loved
 * @param userId            for the per-user meter + seen ledger ONLY (never sent to the LLM)
 * @param opts.forceNew     the user asked for ANOTHER pairing: skip re-serving
 *                          an already-seen cached one and generate instead.
 *                          Unseen cached pairings still win (free AND new).
 */
export async function getCrossMediaReco(
  seedCatalogItemId: string,
  userId: string,
  opts: { forceNew?: boolean } = {},
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

  // 1) CACHE FIRST, ranked for THIS user: graph rows before thematic, dropping
  //    what they own or dismissed, unseen before seen. An UNSEEN cached pairing
  //    is both free and new to them, so it beats generating even on a re-roll.
  const cached = await readCacheCandidates(seedCatalogItemId);
  const showable = await showableForUser(userId, cached);
  const unseen = showable.filter((r) => !r.seen);
  if (unseen.length > 0) return { status: "ok", reco: unseen[0] };
  if (!opts.forceNew && showable.length > 0) {
    return { status: "ok", reco: showable[0] };
  }

  // 2) GRAPH PATH (F3.5.8 retrieve→narrate), tried before the deep cut:
  //    materialize the seed's verified edges (lazy, never metered — same cost
  //    class as the old grounding step) and rank them for THIS user (taste =
  //    deterministic selection, no LLM). Narrate the best-ranked edge we have
  //    NOT already narrated — that skip is what makes a second, third… pairing
  //    for the same seed possible instead of re-returning the first forever.
  //    Any candidate here is real by construction and already ownership-
  //    filtered; the LLM is only asked for prose.
  const edges = await getOrMaterializeLinkEdges(seed);
  const ranked = await rankEdgesForUser(userId, seed, edges);
  const narratedTargets = new Set(cached.map((r) => r.targetCatalogItemId));
  const freshEdge = ranked.find((c) => !narratedTargets.has(c.target.id));
  if (freshEdge) return narrateEdge(seed, freshEdge, userId);

  // 3) DEEP-CUT FALLBACK (v2 propose+ground, stamped "thematic"): no edges, or
  //    every edge already narrated / owned. Honest degradation — the model may
  //    only offer a thematic connection here, and the row records that. Titles
  //    already narrated for this seed join the exclude list so a re-roll can't
  //    come back with the same pairing.
  const generated = await generateThematicReco(
    seed,
    userId,
    cached.map((r) => r.targetTitle),
  );
  // A no-charge dead end (cap race) shouldn't strand the user on an empty
  // screen when we still have an already-seen card in hand — re-serve it.
  if (generated.status === "empty" && showable.length > 0) {
    return { status: "ok", reco: showable[0] };
  }
  return generated;
}

/**
 * Generate one THEMATIC (deep-cut) reco for a seed: charge → propose → ground →
 * moderate → persist. Extracted from getCrossMediaReco so the orchestrator
 * above reads as cache → graph → deep cut.
 *
 * @param excludeTargetTitles titles already narrated for THIS seed — appended to
 *        the user's library exclusions so a re-roll proposes something new.
 */
async function generateThematicReco(
  seed: SeedRow,
  userId: string,
  excludeTargetTitles: string[],
): Promise<RecoResult> {
  const seedCatalogItemId = seed.id;

  // 1) Charge the meter FIRST (race-safe hard cap): the guarded upsert admits
  //    at most cap generations, so N concurrent requests can no longer all
  //    reach the provider on a stale read-only pre-check (LLM-cost/quota
  //    amplification). A transient provider failure REFUNDS the charge below,
  //    preserving ADR-009's "never penalized for a generation that never
  //    happened" — while grounding/owned misses stay charged (the LLM call
  //    cost real money).
  if (!(await tryChargeGeneration(userId))) return { status: "empty" };

  // 2) Provider proposes (fixture or real LLM). Only metadata crosses:
  //    excludeTitles are bare catalog titles in the TARGET family — narrated,
  //    already-shown, and owned (see below) — so Pilar 4 still holds. No user
  //    id, no email, nothing that identifies whose taste this is; the titles
  //    are the same public catalog strings search returns to anyone.
  const provider = crossMediaProvider();
  const targetFamily: ("film" | "series" | "album")[] =
    seed.mediaType === "album" ? ["film", "series"] : ["album"];
  // Independent reads (different tables) — the user is already waiting.
  const [shownTitles, ownedTitles] = await Promise.all([
    shownTargetTitles(userId, targetFamily),
    libraryTitles(userId, targetFamily),
  ]);
  const seedMeta: CrossMediaSeed = {
    title: seed.title,
    mediaType: seed.mediaType,
    byline: seed.byline,
    year: seed.year,
    genre: seed.genre,
    // THREE exclusion sources, in falling order of "must not repeat", because
    // the provider clamps the list at 40 and the head of it is what survives:
    //   1. titles already narrated for THIS seed — a re-roll must not hand back
    //      the pairing we already have (the model has no memory of its own
    //      previous answer)
    //   2. titles this user has already been SHOWN for ANY seed — stops the
    //      cross-seed repeat (three different Nolan-ish films all landing on
    //      Pink Floyd's The Wall), which per-seed exclusion can't see
    //   3. their library in the target family — a reco you already own is a
    //      wasted generation
    // A library title crowded out is only a soft loss: step 4b's ownership
    // check is the deterministic backstop. Deduped case-insensitively so a
    // title in two lists doesn't burn two of the 40 slots.
    excludeTitles: dedupeTitles([
      ...excludeTargetTitles,
      ...shownTitles,
      ...ownedTitles,
    ]),
  };
  const proposeStart = Date.now();
  const outcome = await provider.propose(seedMeta);
  // Captured HERE, not inside the closure: on the ok path the log fires after
  // grounding (external catalog HTTP) + ownership + moderation, and folding
  // that time in would make the p50/p95 tiles blame the provider for slow
  // grounding.
  const proposeLatencyMs = Date.now() - proposeStart;
  // Torre de Control telemetry: exactly one row per provider call, stamped at
  // the branch where the LLM-stage verdict is known (a grounding miss is still
  // an LLM "ok" — that health signal lives on the usage meter as spent_no_match).
  const logPropose = (result: LlmCallOutcome) =>
    logLlmCall({
      kind: "propose",
      provider: provider.id,
      model: provider.model,
      promptVersion: CURRENT_PROMPT_VERSION,
      latencyMs: proposeLatencyMs,
      usage: outcome.usage,
      outcome: result,
    });
  // 3) A transient failure (429/network) or unusable output → `failed`, and the
  //    step-1 charge is refunded: net-zero on the meter, distinct from the
  //    `empty` cases (no reco to show). Telemetry and meter writes are
  //    independent rows — run them in parallel (the user is already waiting).
  if (!outcome.ok) {
    await Promise.all([logPropose("transient"), refundGeneration(userId)]);
    return { status: "failed" };
  }
  const proposal = outcome.proposal;

  // 4) GROUNDING (mandatory): resolve the proposed title against the catalog.
  //    Only a real, addable catalog_item is surfaced (LLMs hallucinate titles).
  //    We already CHARGED above (step 1, ADR-009 — the LLM call cost money), so a
  //    grounding miss here is `spent_no_match`, NOT `empty`: a discovery was
  //    spent with nothing to show. Surfacing it (vs. the old silent `empty`) lets
  //    the UI tell the user and offer a re-roll that may ground.
  const grounded = await groundProposal(proposal);
  if (!grounded) {
    await Promise.all([logPropose("ok"), recordSpentNoMatch(userId)]);
    return { status: "spent_no_match" };
  }

  // 4b) LIBRARY CHECK: a grounded reco the user already owns is also nothing
  //     to show (the <exclude> block makes this rare; this is the deterministic
  //     backstop for when the model ignores it). NOT persisted — the global
  //     per-seed cache would permanently pin an already-owned pairing for this
  //     user; a re-roll with the exclusion list can still find another link.
  if (await userOwnsItem(userId, grounded.id)) {
    await Promise.all([logPropose("ok"), recordSpentNoMatch(userId)]);
    return { status: "spent_no_match" };
  }

  // 4c) MODERATION (deterministic, local — see moderation.ts): the row about
  //     to be inserted is a SHARED PERMANENT cache entry served verbatim to
  //     every user, forever. Screen every LLM-authored field — the narrative
  //     plus targetTitle/targetByline/linkClaim (all model output on this
  //     path) — before anything persists. A rejection is treated like a
  //     transient failure: refunded (the user never pays for OUR rejection)
  //     and retryable, with NOTHING written.
  //     Two calls so the total-length cap stays scoped to the narrative
  //     (moderation.ts sizes it for the card copy, not the metadata fields).
  const narrativeVerdict = screenNarrative([
    proposal.narrative.hookEyebrow,
    proposal.narrative.hookTitle,
    proposal.narrative.resultEyebrow,
    proposal.narrative.closer,
  ]);
  const moderation = narrativeVerdict.ok
    ? screenNarrative([
        proposal.targetTitle,
        proposal.targetByline ?? "",
        proposal.linkClaim ?? "",
      ])
    : narrativeVerdict;
  if (!moderation.ok) {
    console.error(
      "[crossmedia] narrative rejected by moderation:",
      moderation.reason,
    );
    await Promise.all([
      logPropose("moderation_rejected"),
      refundGeneration(userId),
    ]);
    return { status: "failed" };
  }
  await logPropose("ok");

  // 5) Persist the thematic reco. onConflictDoNothing on the (seed, target)
  //    unique: a concurrent request may have narrated this very pairing first
  //    (or the model may have re-proposed a pairing this seed already has,
  //    despite the exclude list) — either way, re-read that row.
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
    const cached = await readCacheForPair(seedCatalogItemId, grounded.id);
    return cached ? { status: "ok", reco: cached } : { status: "empty" };
  }

  return {
    status: "ok",
    reco: toReco(row.id, proposal, grounded, provider.id, false),
  };
}

/**
 * F3.5.8 graph path: narrate ONE verified edge (metered). The caller has already
 * ruled out the cache and picked the best-ranked edge it hasn't narrated yet, so
 * this function only generates. The target is a real catalog_item and already
 * ownership-filtered — no grounding, no post-hoc library check; spent_no_match
 * can't happen here outside a hairline TOCTOU (user adds the target
 * mid-request), which we accept: the row still serves everyone else.
 */
async function narrateEdge(
  seed: GraphCatalogItemRow,
  best: RankedTarget,
  userId: string,
): Promise<RecoResult> {
  if (!(await tryChargeGeneration(userId))) return { status: "empty" };

  const meta = (best.edge.meta ?? {}) as { composer?: string; artist?: string };
  const creatorName = meta.composer ?? meta.artist ?? null;
  const videoTitle = seed.mediaType === "album" ? best.target.title : seed.title;
  const albumTitle = seed.mediaType === "album" ? seed.title : best.target.title;
  const linkType = best.edge.linkType as CrossMediaLinkType;
  const linkClaim = buildLinkClaim(linkType, videoTitle, albumTitle, creatorName);

  const provider = crossMediaProvider();
  const narrateStart = Date.now();
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
  // Captured at resolution time — see the logPropose latency note above.
  const narrateLatencyMs = Date.now() - narrateStart;
  // Torre de Control telemetry — narrate-path sibling of logPropose above.
  const logNarrate = (result: LlmCallOutcome) =>
    logLlmCall({
      kind: "narrate",
      provider: provider.id,
      model: provider.model,
      promptVersion: NARRATE_PROMPT_VERSION,
      latencyMs: narrateLatencyMs,
      usage: outcome.usage,
      outcome: result,
    });
  if (!outcome.ok) {
    await Promise.all([logNarrate("transient"), refundGeneration(userId)]);
    return { status: "failed" };
  }

  // MODERATION (deterministic, local — see moderation.ts): this row is a
  // SHARED PERMANENT cache entry served verbatim to every user, forever.
  // Screen the LLM-authored narrative before it persists (linkClaim is our
  // own deterministic string on this path — not screened). A rejection is
  // treated like a transient failure: refunded and retryable, NOTHING written.
  const moderation = screenNarrative([
    outcome.narrative.hookEyebrow,
    outcome.narrative.hookTitle,
    outcome.narrative.resultEyebrow,
    outcome.narrative.closer,
  ]);
  if (!moderation.ok) {
    console.error(
      "[crossmedia] narrative rejected by moderation:",
      moderation.reason,
    );
    await Promise.all([
      logNarrate("moderation_rejected"),
      refundGeneration(userId),
    ]);
    return { status: "failed" };
  }
  await logNarrate("ok");

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
      recId: row.id,
      targetCatalogItemId: best.target.id,
      targetTitle: best.target.title,
      targetMediaType: best.target.mediaType,
      targetByline: best.target.byline,
      targetYear: best.target.year,
      targetPosterUrl: best.target.posterUrl,
      narrative: outcome.narrative,
      provider: provider.id,
      linkKind: "factual",
      cached: false,
      seen: false,
    },
  };
}

/** Shared select shape for all cache readers (rec row + joined target). */
const CACHE_SELECT = {
  id: crossMediaRecs.id,
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
  id: string;
  hookEyebrow: string;
  hookTitle: string;
  resultEyebrow: string;
  closer: string | null;
  provider: string;
  linkType: string | null;
  createdAt: Date;
  target: typeof catalogItems.$inferSelect;
};

/** `seen` starts false — only showableForUser/orderShowable can know the truth. */
function toCachedReco(hit: CacheHit): CrossMediaReco {
  return {
    recId: hit.id,
    seen: false,
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
    linkKind: linkKindOf(hit.linkType),
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

/**
 * F3.5.9 — the user's per-rec ledger state for a batch of recs. Two sets, because
 * seen and dismissed drive opposite decisions: seen only DEPRIORITIZES (a re-serve
 * is still free), dismissed EXCLUDES.
 */
async function recSeenState(
  userId: string,
  recIds: string[],
): Promise<{ seen: Set<string>; dismissed: Set<string> }> {
  if (recIds.length === 0) return { seen: new Set(), dismissed: new Set() };
  const rows = await db
    .select({
      crossMediaRecId: crossMediaRecSeen.crossMediaRecId,
      dismissedAt: crossMediaRecSeen.dismissedAt,
    })
    .from(crossMediaRecSeen)
    .where(
      and(
        eq(crossMediaRecSeen.userId, userId),
        inArray(crossMediaRecSeen.crossMediaRecId, recIds),
      ),
    );
  const seen = new Set(rows.map((r) => r.crossMediaRecId));
  const dismissed = new Set(
    rows.filter((r) => r.dismissedAt !== null).map((r) => r.crossMediaRecId),
  );
  return { seen, dismissed };
}

/** Which of these catalog items the user already has (any backlog), batched. */
async function ownedTargetIds(
  userId: string,
  targetIds: string[],
): Promise<Set<string>> {
  if (targetIds.length === 0) return new Set();
  const rows = await db
    .select({ catalogItemId: userItems.catalogItemId })
    .from(userItems)
    .where(
      and(
        eq(userItems.userId, userId),
        inArray(userItems.catalogItemId, targetIds),
      ),
    );
  return new Set(rows.map((r) => r.catalogItemId));
}

/**
 * THE per-user view of a seed's shared cache (F3.5.9). Drops what the user owns
 * (read-time library check — the cache is cross-user) and what they dismissed,
 * then puts UNSEEN pairings first, preserving the caller's order within each
 * group (readCacheCandidates already ranks graph rows before thematic).
 *
 * Pure so the feed can reuse it across many seeds off ONE batched pair of reads.
 */
function orderShowable(
  recos: CrossMediaReco[],
  owned: Set<string>,
  state: { seen: Set<string>; dismissed: Set<string> },
): CrossMediaReco[] {
  const eligible = recos
    .filter(
      (r) => !owned.has(r.targetCatalogItemId) && !state.dismissed.has(r.recId),
    )
    .map((r) => ({ ...r, seen: state.seen.has(r.recId) }));
  return [...eligible.filter((r) => !r.seen), ...eligible.filter((r) => r.seen)];
}

/** Single-seed convenience wrapper around {@link orderShowable}. */
async function showableForUser(
  userId: string,
  recos: CrossMediaReco[],
): Promise<CrossMediaReco[]> {
  if (recos.length === 0) return [];
  const [owned, state] = await Promise.all([
    ownedTargetIds(userId, [...new Set(recos.map((r) => r.targetCatalogItemId))]),
    recSeenState(
      userId,
      recos.map((r) => r.recId),
    ),
  ]);
  return orderShowable(recos, owned, state);
}

/**
 * Record that this user was SHOWN a pairing. Idempotent and deliberately
 * non-destructive: onConflictDoNothing keeps the first seenAt AND never
 * resurrects a dismissed row.
 */
export async function markRecoSeen(
  userId: string,
  crossMediaRecId: string,
): Promise<void> {
  await db
    .insert(crossMediaRecSeen)
    .values({ userId, crossMediaRecId })
    .onConflictDoNothing();
}

/** The × — hide this pairing from this user for good. Upsert: × after a view. */
export async function dismissReco(
  userId: string,
  crossMediaRecId: string,
): Promise<void> {
  await db
    .insert(crossMediaRecSeen)
    .values({ userId, crossMediaRecId, dismissedAt: new Date() })
    .onConflictDoUpdate({
      target: [crossMediaRecSeen.userId, crossMediaRecSeen.crossMediaRecId],
      set: { dismissedAt: sql`now()` },
    });
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
  const cap = await capForUser(userId);
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
      setWhere: sql`${crossMediaRecUsage.generations} < ${cap}`,
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
 * Titles this user has already BEEN SHOWN as a reco, any seed, target family
 * only, newest first — the cross-seed half of the exclude list.
 *
 * Per-seed exclusion can't see this: it stops "Memento → The Wall" twice, but
 * not "Inception → The Wall" AND "Memento → The Wall", which is the repetition
 * that actually reads as canned. Sourced from the F3.5.9 seen ledger, so it only
 * ever suppresses pairings the user has really laid eyes on.
 *
 * KNOWN TRADEOFF: the row this shapes lands in the SHARED cross-user cache, so
 * one user's "already saw it" nudges what every later user gets for that seed.
 * That's pre-existing (libraryTitles has always done it) and it's the deal the
 * shared cache makes — noted here so it isn't rediscovered as a bug. The 10-row
 * cap keeps the nudge small next to the 40-title budget.
 */
async function shownTargetTitles(
  userId: string,
  family: ("film" | "series" | "album")[],
  limit = 10,
): Promise<string[]> {
  const rows = await db
    .select({ title: catalogItems.title })
    .from(crossMediaRecSeen)
    .innerJoin(
      crossMediaRecs,
      eq(crossMediaRecSeen.crossMediaRecId, crossMediaRecs.id),
    )
    .innerJoin(
      catalogItems,
      eq(crossMediaRecs.targetCatalogItemId, catalogItems.id),
    )
    .where(
      and(
        eq(crossMediaRecSeen.userId, userId),
        inArray(catalogItems.mediaType, family),
      ),
    )
    .orderBy(desc(crossMediaRecSeen.seenAt))
    .limit(limit);
  return rows.map((r) => r.title);
}

/** Order-preserving, case-insensitive dedupe — the exclude budget is only 40. */
function dedupeTitles(titles: string[]): string[] {
  const seen = new Set<string>();
  return titles.filter((t) => {
    const key = t.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
 * out an otherwise-real album). Video targets skip making-of/behind-the-scenes
 * featurettes (isNonPrimaryVideoTitle): TMDB lists them as "movie", but they're
 * junk recos with no streaming providers — better a spent_no_match the UI
 * surfaces than a dead-end pairing. Returns null when nothing resolves — the
 * reco is then dropped (the hallucination guard: prose can be the LLM's, the
 * item must be real).
 */
async function groundProposal(
  proposal: CrossMediaProposal,
): Promise<SeedRow | null> {
  const queries = [
    [proposal.targetTitle, proposal.targetByline].filter(Boolean).join(" "),
    proposal.targetTitle,
  ].filter((q, i, a) => q && a.indexOf(q) === i);

  const wantsVideo = proposal.targetMediaType !== "album";
  for (const query of queries) {
    let results;
    try {
      results = await unifiedSearch(query, proposal.targetMediaType);
    } catch (err) {
      console.error("[crossmedia] grounding search failed:", err);
      continue;
    }
    const match = results.find(
      (r) =>
        r.mediaType === proposal.targetMediaType &&
        !(wantsVideo && isNonPrimaryVideoTitle(r.title)),
    );
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
  recId: string,
  proposal: CrossMediaProposal,
  target: SeedRow,
  providerId: string,
  cached: boolean,
): CrossMediaReco {
  return {
    recId,
    seen: false,
    targetCatalogItemId: target.id,
    targetTitle: target.title,
    targetMediaType: target.mediaType,
    targetByline: target.byline,
    targetYear: target.year,
    targetPosterUrl: target.posterUrl,
    narrative: proposal.narrative,
    provider: providerId,
    linkKind: "thematic",
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

/**
 * Payload ceiling for one feed read. Since F3.5.9 a seed can hold many cached
 * pairings, and getLovedSeeds returns up to 24 seeds — without this, a heavy user
 * would ship ~100 pairings to the client to look at one card at a time.
 */
const FEED_MAX_ITEMS = 40;

/** Take one from each group, round-robin, until every group is drained. */
function interleave<T>(groups: T[][]): T[] {
  const out: T[] = [];
  const depth = Math.max(0, ...groups.map((g) => g.length));
  for (let i = 0; i < depth; i++) {
    for (const group of groups) {
      if (i < group.length) out.push(group[i]);
    }
  }
  return out;
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
 * another" action (generateAnotherReco).
 */
export async function getCrossMediaFeed(userId: string): Promise<CrossMediaFeed> {
  const cap = await capForUser(userId);
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

  // Cache-first read: a seed can have SEVERAL cached pairings (one per narrated
  // edge, plus any number of deep cuts since F3.5.9). Emit EVERY showable one —
  // the old code took a single pick per seed, which threw away variety we had
  // already paid for and left the × with nowhere to go. Ownership + seen/
  // dismissed state resolve in ONE batched pair of reads for all seeds.
  const seedCandidates: { seed: LovedSeed; recos: CrossMediaReco[] }[] = [];
  for (const seed of seeds) {
    const recos = await readCacheCandidates(seed.catalogItemId);
    if (recos.length > 0) seedCandidates.push({ seed, recos });
  }
  const allRecos = seedCandidates.flatMap((s) => s.recos);
  const [ownedTargets, seenState] = await Promise.all([
    ownedTargetIds(userId, [
      ...new Set(allRecos.map((r) => r.targetCatalogItemId)),
    ]),
    recSeenState(
      userId,
      allRecos.map((r) => r.recId),
    ),
  ]);
  // Round-robin across seeds: the × should walk a DIFFERENT loved title next,
  // not grind through five pairings of the same one. Truncating AFTER the
  // interleave is what makes the cap harmless — round 1 of every seed lands
  // before round 2 of any, so what falls off the end is only ever a seed's
  // nth-best pairing, and the × reaches it on a later pass anyway.
  const items: CrossMediaFeedItem[] = interleave(
    seedCandidates.map(({ seed, recos }) =>
      orderShowable(recos, ownedTargets, seenState).map((r) =>
        toFeedItem(seed, r),
      ),
    ),
  ).slice(0, FEED_MAX_ITEMS);

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
 * User-initiated generation for the "otra conexión" button. Spends ONE
 * generation on ONE seed — bounded per call so the meter only moves on
 * deliberate taps (getCrossMediaReco enforces the cap + grounding).
 *
 * F3.5.9 — WHICH seed gets it, in strict order of what buys the user the most:
 *   1. a loved title that has NEVER had a recommendation
 *   2. a title whose every cached pairing is owned or dismissed
 *   3. the title on screen (`preferSeedCatalogItemId`) — a re-roll
 *   4. their most recent loved title
 *
 * Breadth before depth, deliberately. An earlier cut of this put the on-screen
 * seed first and it trapped the user on one title: the feed only had that seed
 * showable, so × → generate → land back on the same seed → × … while two loved
 * titles sat at zero recommendations. Re-rolling is the FALLBACK for when the
 * library is already covered, not the default.
 *
 * The one-reco-per-item dead end stays fixed either way — step 3 exists, and
 * `getCrossMediaReco` can now narrate a further edge or another deep cut.
 *
 * Returns the `seedCatalogItemId` it generated for on `result === "generated"`
 * (null otherwise) so the caller can land on exactly that pairing after a
 * cache-first re-read — getCrossMediaFeed orders items by seed, not append
 * order, so a positional guess would land on the wrong one.
 */
export async function generateAnotherReco(
  userId: string,
  preferSeedCatalogItemId?: string | null,
): Promise<{ result: DiscoverResult; seedCatalogItemId: string | null }> {
  const seeds = await getLovedSeeds(userId);
  if (seeds.length === 0) return { result: "no_more", seedCatalogItemId: null };
  if ((await remainingGenerations(userId)) <= 0)
    return { result: "cap_reached", seedCatalogItemId: null };

  // Breadth first (see the ordering in the doc comment above): a title with
  // nothing to show — least of all one that has never had a recommendation at
  // all — beats another pairing for the title already on screen.
  const preferred = preferSeedCatalogItemId
    ? seeds.find((s) => s.catalogItemId === preferSeedCatalogItemId)
    : undefined;
  const target =
    (await neediestSeed(userId, seeds)) ?? preferred ?? seeds[0];

  // forceNew: don't hand back an already-seen cached pairing here — the user
  // explicitly asked for another one. An UNSEEN cached pairing still wins
  // (free and new), and getCrossMediaReco handles that internally.
  const res = await getCrossMediaReco(target.catalogItemId, userId, {
    forceNew: true,
  });
  if (res.status === "ok")
    return { result: "generated", seedCatalogItemId: target.catalogItemId };
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

/**
 * The loved seed with the most to gain from one generation, or null when every
 * title already has something showable.
 *
 * Two buckets, and the order between them matters: a title that has NEVER been
 * narrated (no cached row at all) outranks one whose pairings merely ran out
 * for this user, because the first buys a silent title its voice and the second
 * only buys a replacement. Within a bucket, library order wins.
 */
async function neediestSeed(
  userId: string,
  seeds: LovedSeed[],
): Promise<LovedSeed | null> {
  let exhausted: LovedSeed | null = null;
  for (const seed of seeds) {
    const cached = await readCacheCandidates(seed.catalogItemId);
    // Never narrated — take it immediately, nothing outranks this.
    if (cached.length === 0) return seed;
    if (exhausted) continue; // already hold a bucket-2 pick; keep scanning for a bucket-1
    const showable = await showableForUser(userId, cached);
    if (showable.length === 0) exhausted = seed;
  }
  return exhausted;
}

/** Remaining generations this month for a user (for UI / meter display). */
export async function remainingGenerations(userId: string): Promise<number> {
  const cap = await capForUser(userId);
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
  return Math.max(0, cap - (row?.generations ?? 0));
}

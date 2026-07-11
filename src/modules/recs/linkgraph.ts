import "server-only";
import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { catalogItems, crossMediaLinks, userItems } from "@/db/schema";
import { unifiedSearch } from "@/modules/catalog/search";
import { videoCatalog } from "@/modules/catalog/tmdb";

/**
 * F3.5.8 — the LINK GRAPH module: lazy extraction + deterministic per-user
 * ranking of verified cross-media edges (video ↔ album). This module owns the
 * "retrieve" half of retrieve→narrate; it never talks to the LLM provider and
 * never touches the generation meter. Edges are a global shared asset: one
 * extraction serves every user, forever (180d refresh TTL).
 *
 * Extraction reuses unifiedSearch as both resolver and cache-warmer, so every
 * edge endpoint is a real, addable catalog_item by construction — grounding
 * becomes structural instead of a post-hoc search.
 */

/** Graph edge types with an automatic extractor today. "inspired" /
 *  "artist_on_soundtrack" are valid vocabulary reserved for a future curated
 *  pass — deliberately not extracted in this phase. */
export type CrossMediaLinkType =
  | "soundtrack"
  | "score"
  | "artist_on_soundtrack"
  | "inspired";

/** What a cross_media_rec row can be stamped with: a graph edge type, or the
 *  deep-cut fallback marker (v2 propose+ground — honest about being vibes). */
export type CrossMediaRecLinkType = CrossMediaLinkType | "thematic";

export type CatalogItemRow = typeof catalogItems.$inferSelect;
export type LinkEdgeRow = typeof crossMediaLinks.$inferSelect;

export interface RankedTarget {
  edge: LinkEdgeRow;
  /** The opposite-media endpoint — a real catalog_item, addable as-is. */
  target: CatalogItemRow;
}

/** 180d — see catalogItems.linkEdgesCheckedAt. */
export const LINK_EDGES_STALE_MS = 180 * 24 * 60 * 60 * 1000;

/** Priority when affinity ties: factual authority of the link kind. */
const LINK_TYPE_RANK: Record<string, number> = {
  soundtrack: 0,
  score: 1,
  artist_on_soundtrack: 2,
  inspired: 3,
};

// ============================================================
// Read + lazy materialization
// ============================================================

/**
 * The seed's edges, extracting them first when never tried or stale. The
 * extraction is 1–3 external calls (same cost class as v2's grounding step)
 * and is NEVER metered. linkEdgesCheckedAt is stamped on every attempt —
 * found or not — so empty seeds don't re-hit iTunes/TMDB per request.
 * Concurrent materialization is safe: edge inserts are onConflictDoNothing
 * on the (video, album, linkType) unique.
 */
export async function getOrMaterializeLinkEdges(
  seed: CatalogItemRow,
): Promise<LinkEdgeRow[]> {
  const fresh =
    seed.linkEdgesCheckedAt &&
    Date.now() - seed.linkEdgesCheckedAt.getTime() < LINK_EDGES_STALE_MS;
  if (!fresh) {
    try {
      const found =
        seed.mediaType === "album"
          ? await extractAlbumEdges(seed)
          : await extractVideoEdges(seed);
      if (found.length > 0) {
        await db.insert(crossMediaLinks).values(found).onConflictDoNothing();
      }
    } catch (err) {
      // Fail-open to "no new edges": extraction is best-effort; the pipeline
      // degrades to whatever edges exist (or the thematic fallback).
      console.error("[linkgraph] extraction failed:", err);
    }
    await db
      .update(catalogItems)
      .set({ linkEdgesCheckedAt: new Date() })
      .where(eq(catalogItems.id, seed.id));
  }

  const side =
    seed.mediaType === "album"
      ? eq(crossMediaLinks.albumCatalogItemId, seed.id)
      : eq(crossMediaLinks.videoCatalogItemId, seed.id);
  return db.select().from(crossMediaLinks).where(side);
}

// ============================================================
// Deterministic per-user ranking (taste = selection, not generation)
// ============================================================

/**
 * Rank the seed's edges for one user: drop targets already in their library,
 * then order by taste affinity (artist match on their liked/obsessed items in
 * the target family, then genre match), link-type authority, and age. Pure
 * SQL + arithmetic — no LLM, no meter, recomputed cheaply per request.
 * userId never leaves this process (Pilar 4: it only scopes DB reads here).
 */
export async function rankEdgesForUser(
  userId: string,
  seed: CatalogItemRow,
  edges: LinkEdgeRow[],
): Promise<RankedTarget[]> {
  if (edges.length === 0) return [];
  const targetIds = edges.map((e) =>
    seed.mediaType === "album" ? e.videoCatalogItemId : e.albumCatalogItemId,
  );

  const [targets, owned, tasteRows] = await Promise.all([
    db.select().from(catalogItems).where(inArray(catalogItems.id, targetIds)),
    db
      .select({ catalogItemId: userItems.catalogItemId })
      .from(userItems)
      .where(
        and(
          eq(userItems.userId, userId),
          inArray(userItems.catalogItemId, targetIds),
        ),
      ),
    // Taste signals: bylines (artists/studios) + genres of the user's
    // loved titles in the TARGET family. Catalog metadata only.
    db
      .select({ byline: catalogItems.byline, genre: catalogItems.genre })
      .from(userItems)
      .innerJoin(catalogItems, eq(userItems.catalogItemId, catalogItems.id))
      .where(
        and(
          eq(userItems.userId, userId),
          inArray(
            catalogItems.mediaType,
            seed.mediaType === "album" ? ["film", "series"] : ["album"],
          ),
          or(eq(userItems.obsessed, true), eq(userItems.verdict, "liked")),
        ),
      ),
  ]);

  const targetById = new Map(targets.map((t) => [t.id, t]));
  const ownedIds = new Set(owned.map((o) => o.catalogItemId));
  const lovedBylines = new Set(
    tasteRows.map((r) => r.byline?.toLowerCase()).filter(Boolean),
  );
  const lovedGenres = new Set(
    tasteRows.map((r) => r.genre?.toLowerCase()).filter(Boolean),
  );

  const scored = edges.flatMap((edge) => {
    const targetId =
      seed.mediaType === "album" ? edge.videoCatalogItemId : edge.albumCatalogItemId;
    const target = targetById.get(targetId);
    if (!target || ownedIds.has(targetId)) return [];
    let affinity = 0;
    if (target.byline && lovedBylines.has(target.byline.toLowerCase()))
      affinity += 2;
    if (target.genre && lovedGenres.has(target.genre.toLowerCase()))
      affinity += 1;
    return [{ edge, target, affinity }];
  });

  return scored
    .sort(
      (a, b) =>
        b.affinity - a.affinity ||
        (LINK_TYPE_RANK[a.edge.linkType] ?? 9) -
          (LINK_TYPE_RANK[b.edge.linkType] ?? 9) ||
        a.edge.createdAt.getTime() - b.edge.createdAt.getTime(),
    )
    .map(({ edge, target }) => ({ edge, target }));
}

// ============================================================
// Deterministic link claim (replaces the LLM-authored claim on this path)
// ============================================================

/** The factual claim, built from the edge — true by construction, never the
 *  model's to invent. Rendered nowhere (audit + narration grounding). */
export function buildLinkClaim(
  linkType: CrossMediaLinkType,
  videoTitle: string,
  albumTitle: string,
  creatorName: string | null,
): string {
  switch (linkType) {
    case "soundtrack":
      return `«${albumTitle}» es el soundtrack de «${videoTitle}».`;
    case "score":
      return `${creatorName ?? "El mismo compositor"} compuso la música de «${videoTitle}» — «${albumTitle}» es ese trabajo.`;
    case "artist_on_soundtrack":
      return `${creatorName ?? "El artista"} aparece en el soundtrack de «${videoTitle}».`;
    case "inspired":
      return `«${videoTitle}» y «${albumTitle}» están conectados por un vínculo documentado en el catálogo.`;
  }
}

// ============================================================
// Extraction heuristics (internal)
// ============================================================

type NewLinkEdge = typeof crossMediaLinks.$inferInsert;

const SOUNDTRACK_TITLE_RE =
  /original (motion picture|series|game)? ?(soundtrack|score)|music from (the )?(motion picture|film|series|movie)|banda sonora( original)?|\bsoundtrack\b|música original/i;

/**
 * Derivative albums that reference a film without BEING its soundtrack —
 * covers, tributes, lullaby/karaoke renditions, re-performances. An edge to
 * one of these would be a technically-true but misleading "verified" claim
 * (found live by the --edges eval: "Lullaby Versions of…", "MBM Performs…",
 * "[Cover Version] - Single").
 */
const DERIVATIVE_ALBUM_RE =
  /\b(covers?|tributes?|karaoke|lullab(y|ies)|performs|made famous|in the style of|music box|8[- ]?bit|reimagined)\b|cover version|- single$/i;

function looksLikeSoundtrack(row: { title: string; genre: string | null }): boolean {
  if (DERIVATIVE_ALBUM_RE.test(row.title)) return false;
  return (
    SOUNDTRACK_TITLE_RE.test(row.title) ||
    (row.genre ?? "").toLowerCase() === "soundtrack"
  );
}

/** "Dune (Original Motion Picture Soundtrack)" → "Dune". */
function stripSoundtrackSuffix(title: string): string {
  return title
    .replace(
      /[([][^)\]]*?(soundtrack|banda sonora|score|música|music from)[^)\]]*?[)\]]/gi,
      "",
    )
    .replace(
      /\b(music from (the )?)?(original )?(motion picture |netflix original series )?(soundtrack|banda sonora)\b.*$/i,
      "",
    )
    .trim()
    .replace(/[-–:,]$/, "")
    .trim();
}

function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Loose reference check (names, bylines): normalized containment either way.
 * NOT year-aware — for edge TITLES use edgeTitlesMatch below.
 */
function titleOverlap(anchor: string, candidate: string): boolean {
  const a = normalizeTitle(anchor);
  const c = normalizeTitle(candidate);
  if (!a || !c) return false;
  return c.includes(a) || a.includes(c);
}

/**
 * Franchise-safe title match for EDGES (review finding: bare containment let
 * the «Cars» soundtrack claim «Cars 2» — a persistent, cross-user false
 * "verified" link). Containment is only trusted when both years exist and sit
 * within a small drift window (soundtrack vs film release); with a year
 * missing, only an exact normalized match passes. Fail-closed: a missed edge
 * degrades to the thematic fallback, a false edge would lie to users.
 */
function edgeTitlesMatch(
  anchor: string,
  candidate: string,
  anchorYear: number | null,
  candidateYear: number | null,
): boolean {
  const a = normalizeTitle(anchor);
  const c = normalizeTitle(candidate);
  if (!a || !c) return false;
  if (!(c.includes(a) || a.includes(c))) return false;
  if (anchorYear != null && candidateYear != null) {
    return Math.abs(anchorYear - candidateYear) <= 2;
  }
  return a === c;
}

/** Resolve a search query to full catalog rows (unifiedSearch warms/upserts
 *  the shared cache, so the rows always exist right after). */
async function searchCatalogRows(
  query: string,
  tab: "film" | "series" | "album",
): Promise<CatalogItemRow[]> {
  const hits = await unifiedSearch(query, tab);
  const ids = hits
    .filter((h) => h.mediaType === tab)
    .map((h) => h.catalogItemId);
  if (ids.length === 0) return [];
  const rows = await db
    .select()
    .from(catalogItems)
    .where(inArray(catalogItems.id, ids));
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

/**
 * Video seed → album edges:
 *  (a) iTunes soundtrack search — keyless, always available.
 *  (b) TMDB composer credit → "{composer} {title}" album lookup ("score").
 *      Silently skipped on fixtures (getComposer not implemented) or errors.
 */
async function extractVideoEdges(seed: CatalogItemRow): Promise<NewLinkEdge[]> {
  const edges: NewLinkEdge[] = [];
  const seen = new Set<string>();

  const soundtrackQuery = `${seed.title} soundtrack`;
  for (const row of await searchCatalogRows(soundtrackQuery, "album")) {
    if (
      !looksLikeSoundtrack(row) ||
      !edgeTitlesMatch(seed.title, row.title, seed.year, row.year)
    )
      continue;
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    edges.push({
      videoCatalogItemId: seed.id,
      albumCatalogItemId: row.id,
      linkType: "soundtrack",
      source: "itunes_soundtrack_search",
      meta: { artist: row.byline, matchedQuery: soundtrackQuery },
    });
    if (edges.length >= 3) break;
  }

  if (seed.source === "tmdb" && videoCatalog.getComposer) {
    const composer = await videoCatalog.getComposer(
      seed.externalId,
      seed.mediaType === "series" ? "series" : "film",
    );
    if (composer) {
      const scoreQuery = `${composer} ${seed.title}`;
      for (const row of await searchCatalogRows(scoreQuery, "album")) {
        // The album must reference the film (year-checked, franchise-safe)
        // AND the composer must be its artist — both, or a homonymous
        // unrelated album slips through. Derivative albums (covers/lullaby)
        // never qualify as the composer's work.
        if (DERIVATIVE_ALBUM_RE.test(row.title)) continue;
        if (!edgeTitlesMatch(seed.title, row.title, seed.year, row.year))
          continue;
        if (!row.byline || !titleOverlap(composer, row.byline)) continue;
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        edges.push({
          videoCatalogItemId: seed.id,
          albumCatalogItemId: row.id,
          linkType: "score",
          source: "tmdb_credits_itunes_lookup",
          meta: { composer, matchedQuery: scoreQuery },
        });
        break;
      }
    }
  }

  return edges;
}

/**
 * Album seed → film/series edge, only when the album itself smells like a
 * soundtrack (title marker or iTunes genre). Anything else has no reliable
 * automatic reverse lookup — reserved for the curated pass; the pipeline
 * falls back to the thematic path.
 */
async function extractAlbumEdges(seed: CatalogItemRow): Promise<NewLinkEdge[]> {
  if (!looksLikeSoundtrack(seed)) return [];
  const candidate = stripSoundtrackSuffix(seed.title);
  if (!candidate) return [];

  for (const tab of ["film", "series"] as const) {
    for (const row of await searchCatalogRows(candidate, tab)) {
      if (!edgeTitlesMatch(candidate, row.title, seed.year, row.year)) continue;
      return [
        {
          videoCatalogItemId: row.id,
          albumCatalogItemId: seed.id,
          linkType: "soundtrack",
          source: "itunes_soundtrack_title_heuristic",
          meta: { artist: seed.byline, matchedQuery: candidate },
        },
      ];
    }
  }
  return [];
}

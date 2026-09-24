/**
 * Discover's "recomendado para ti" cards from the obsession rails — the ONE
 * interleave/dedupe rule shared by the web page (descubrir/page.tsx) and the
 * mobile API (`GET /api/v1/discover`), so the two surfaces show the same cards
 * in the same order.
 *
 * Pure module (no "server-only", no DB): it only reshapes what
 * `getObsessionRails` already read. Generic over the work type so it never
 * has to import the server-only rails module.
 */

export interface RailLike<W extends { catalogItemId: string }> {
  /** The obsessed title the rail is "because of". */
  seed: { catalogItemId: string; title: string };
  items: W[];
}

export interface DiscoverCard<W extends { catalogItemId: string }> {
  work: W;
  /** The obsessed title the rail hangs from — the kicker's "porque". */
  because: string;
  /** Its id — the API's `seedTitleId`. */
  seedTitleId: string;
}

/**
 * Rails → cards, interleaved (every rail's best first, then every rail's
 * second…) so the first cards speak for different obsessions. A title two
 * obsessions both point to shows once, under the first.
 */
export function recCards<W extends { catalogItemId: string }>(
  rails: RailLike<W>[],
): DiscoverCard<W>[] {
  const out: DiscoverCard<W>[] = [];
  const seen = new Set<string>();
  const depth = Math.max(0, ...rails.map((r) => r.items.length));
  for (let i = 0; i < depth; i++) {
    for (const rail of rails) {
      const work = rail.items[i];
      if (!work || seen.has(work.catalogItemId)) continue;
      seen.add(work.catalogItemId);
      out.push({
        work,
        because: rail.seed.title,
        seedTitleId: rail.seed.catalogItemId,
      });
    }
  }
  return out;
}

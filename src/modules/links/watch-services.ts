/**
 * «Dónde ver» por servicio (fase 1, founder 2026-10-03) — the PURE half: the
 * table of known services, which TMDB providers count as each one, the ids
 * Wikidata may hand us, and the https link each row opens. No network, no
 * `server-only`: `watch-services.test.ts` runs it as is. The fetching half is
 * `watch-options.ts`.
 *
 * Every link is DIRECT (the service's own https host), never our 302: iOS only
 * hands a tap to another app when the tap itself goes to that app's host
 * (learning 2026-10-02-musica-abre-la-web-no-la-app).
 *
 * Security posture: a Wikidata id is community-edited text. It is matched
 * against a strict per-service shape BEFORE it is put in a URL, and every URL
 * built here is re-parsed and its host compared with the service's — a value
 * that would land anywhere else yields no link, not a different one.
 */

export type WatchServiceKey = "apple_tv" | "netflix" | "prime_video" | "hbo_max";
export type VideoMediaType = "film" | "series";

/** The exact-link ids a title may have (already validated — see `parseWikidataIds`). */
export interface WatchServiceIds {
  /** Apple TV `umc.cmc.…` (P9751 for a series, P9586 for a film). */
  appleTv?: string;
  /** Netflix numeric title id (P1874). */
  netflix?: string;
  /** HBO Max `show/{uuid}` | `movie/{uuid}` (P8298, live format only). */
  hboMax?: string;
}

interface WatchService {
  key: WatchServiceKey;
  /** What the row says. */
  name: string;
  /** The only host a link of this service may point at. */
  host: string;
  /** TMDB `provider_id`s that ARE this service (verified against
   *  `/watch/providers/{tv,movie}?watch_region=MX` on 2026-10-03). The "with
   *  ads" tiers are the same app, so the same row. "Channels" (HBO Max Amazon
   *  Channel 1825, Apple TV Amazon Channel 2243, MUBI Amazon Channel 201…) and
   *  the stores (Apple TV Store 2, Amazon Video 10) are other ids and are
   *  deliberately absent: they get no row. */
  providerIds: readonly number[];
}

/** Row order = this order. */
export const WATCH_SERVICES: readonly WatchService[] = [
  { key: "apple_tv", name: "Apple TV", host: "tv.apple.com", providerIds: [350] },
  { key: "netflix", name: "Netflix", host: "www.netflix.com", providerIds: [8, 1796] },
  // 9 = Amazon Prime Video (US and most regions), 119 = the same service's id
  // in MX/LatAm, 2100 = its "with Ads" tier.
  { key: "prime_video", name: "Prime Video", host: "www.primevideo.com", providerIds: [9, 119, 2100] },
  { key: "hbo_max", name: "HBO Max", host: "play.hbomax.com", providerIds: [1899] },
];

const SERVICE_BY_PROVIDER = new Map<number, WatchServiceKey>(
  WATCH_SERVICES.flatMap((s) => s.providerIds.map((id) => [id, s.key] as const)),
);

/**
 * TMDB's regional `flatrate` list → the known services the title streams on,
 * in table order, one entry per service however many of its provider ids
 * appear. Matching is by `provider_id` ONLY (never by name: "HBO Max Amazon
 * Channel" contains "HBO Max"). Anything malformed is skipped.
 */
export function streamingServices(flatrate: unknown): WatchServiceKey[] {
  if (!Array.isArray(flatrate)) return [];
  const found = new Set<WatchServiceKey>();
  for (const p of flatrate) {
    const id = (p as { provider_id?: unknown } | null)?.provider_id;
    const key = typeof id === "number" ? SERVICE_BY_PROVIDER.get(id) : undefined;
    if (key) found.add(key);
  }
  return WATCH_SERVICES.filter((s) => found.has(s.key)).map((s) => s.key);
}

// ── ids ────────────────────────────────────────────────────────────────────

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const ID_SHAPE = {
  appleTv: /^umc\.cmc\.[a-z0-9]{8,40}$/,
  netflix: /^[0-9]{4,12}$/,
  // Only the live format. `feature/urn:…` / `series/urn:…` are dead links.
  hboMax: new RegExp(`^(?:show|movie)/${UUID}$`),
} as const;

/** A TMDB id as we may interpolate it into a SPARQL string literal. */
const TMDB_ID = /^[0-9]{1,10}$/;

/** Wikidata property → which id it carries, per media type. */
function propertyMap(mediaType: VideoMediaType): Record<string, keyof WatchServiceIds> {
  return {
    [mediaType === "series" ? "P9751" : "P9586"]: "appleTv",
    P1874: "netflix",
    P8298: "hboMax",
  };
}

/**
 * ONE query: the item whose TMDB id is this one (P4983 series / P4947 film)
 * and whichever of the service ids it has. Null when the TMDB id is not plain
 * digits — nothing else is ever interpolated.
 */
export function wikidataIdsQuery(tmdbId: string, mediaType: VideoMediaType): string | null {
  if (!TMDB_ID.test(tmdbId)) return null;
  const tmdbProp = mediaType === "series" ? "P4983" : "P4947";
  const props = Object.keys(propertyMap(mediaType))
    .map((p) => `wdt:${p}`)
    .join(" ");
  return `SELECT ?p ?v WHERE { ?item wdt:${tmdbProp} "${tmdbId}" . VALUES ?p { ${props} } ?item ?p ?v } LIMIT 40`;
}

/**
 * The SPARQL JSON answer → validated ids. A value that doesn't match its
 * service's shape is dropped (so HBO's dead `feature/urn:…` ids simply don't
 * exist for us); with several valid values the smallest wins, so the answer
 * doesn't depend on the order Wikidata returned them in.
 */
export function parseWikidataIds(body: unknown, mediaType: VideoMediaType): WatchServiceIds {
  const bindings = (body as { results?: { bindings?: unknown } } | null)?.results?.bindings;
  if (!Array.isArray(bindings)) return {};
  const props = propertyMap(mediaType);
  const ids: WatchServiceIds = {};
  for (const b of bindings) {
    const row = b as { p?: { value?: unknown }; v?: { value?: unknown } } | null;
    const p = row?.p?.value;
    const v = row?.v?.value;
    if (typeof p !== "string" || typeof v !== "string") continue;
    const field = props[p.slice(p.lastIndexOf("/") + 1)];
    if (!field || !ID_SHAPE[field].test(v)) continue;
    const current = ids[field];
    if (current === undefined || v < current) ids[field] = v;
  }
  return ids;
}

// ── links ──────────────────────────────────────────────────────────────────

/** The URL, only if it is https on exactly this host. */
function onHost(url: string, host: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === host && !u.username && !u.password ? u.toString() : null;
  } catch {
    return null;
  }
}

export interface WatchLinkInput {
  title: string;
  mediaType: VideoMediaType;
  /** Viewer country, ISO 3166-1 alpha-2 (any case). */
  region: string;
  ids: WatchServiceIds;
}

/**
 * The link a service's row opens: exact when a (re-validated) id exists, else
 * the service's own search — except HBO Max, whose search doesn't take the
 * title: no id, no row (JustWatch covers it). Null = no row.
 */
export function watchServiceUrl(key: WatchServiceKey, input: WatchLinkInput): string | null {
  const service = WATCH_SERVICES.find((s) => s.key === key);
  if (!service) return null;
  const { ids } = input;
  const origin = `https://${service.host}`;
  const q = encodeURIComponent(input.title.trim());
  const search = (path: string) => (q ? onHost(`${origin}${path}${q}`, service.host) : null);

  switch (key) {
    case "apple_tv": {
      if (ids.appleTv && ID_SHAPE.appleTv.test(ids.appleTv)) {
        const kind = input.mediaType === "series" ? "show" : "movie";
        return onHost(`${origin}/${kind}/${ids.appleTv}`, service.host);
      }
      const region = input.region.toLowerCase();
      if (!/^[a-z]{2}$/.test(region)) return null;
      return search(`/${region}/search?term=`);
    }
    case "netflix":
      if (ids.netflix && ID_SHAPE.netflix.test(ids.netflix)) {
        return onHost(`${origin}/title/${ids.netflix}`, service.host);
      }
      return search("/search?q=");
    case "prime_video":
      // Wikidata P8055 is deliberately not used (founder): search only.
      return search("/search?phrase=");
    case "hbo_max":
      if (ids.hboMax && ID_SHAPE.hboMax.test(ids.hboMax)) {
        return onHost(`${origin}/${ids.hboMax}`, service.host);
      }
      return null;
  }
}

/** A row of `watch` on the wire (`WatchOptionSchema`). */
export interface ServiceWatchRow {
  short: string;
  name: string;
  kind: "streaming";
  url: string;
}

/**
 * The service rows of a title, in table order: one per known service in the
 * region's `flatrate`, skipping any that has no link to offer. `short` is the
 * same "ver" the JustWatch row carries (installed apps print it in the row's
 * 40 pt tile).
 */
export function buildServiceRows(flatrate: unknown, input: WatchLinkInput): ServiceWatchRow[] {
  const rows: ServiceWatchRow[] = [];
  for (const key of streamingServices(flatrate)) {
    const url = watchServiceUrl(key, input);
    if (!url) continue;
    const name = WATCH_SERVICES.find((s) => s.key === key)!.name;
    rows.push({ short: "ver", name, kind: "streaming", url });
  }
  return rows;
}

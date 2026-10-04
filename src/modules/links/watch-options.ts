import "server-only";
import { unstable_cache } from "next/cache";
import { redactedError } from "@/authz/safe-log";
import { env } from "@/lib/env";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { SITE_URL } from "@/lib/site";
import type { CatalogItemRow } from "@/modules/catalog/cache";
import { tmdbAuth } from "@/modules/catalog/tmdb";
import {
  buildServiceRows,
  hboLegacyResolveUrls,
  parseHboRedirectLocation,
  parseWikidataIds,
  streamingServices,
  wikidataIdsQuery,
  type ServiceWatchRow,
  type VideoMediaType,
  type WatchServiceIds,
} from "./watch-services";

/**
 * «Dónde ver» por servicio — the fetching half (rules and URLs live in
 * `watch-services.ts`). For a TMDB film/series: where it streams in the
 * viewer's region (TMDB `/watch/providers`, JustWatch data) and the ids that
 * make a link exact (Wikidata), asked IN PARALLEL, each with a short deadline.
 *
 * It never throws and never makes the ficha wait longer than
 * `UPSTREAM_TIMEOUT_MS` (+ `HBO_BUDGET_MS` in the one case below, first view
 * only): TMDB silent → no service rows (the JustWatch row the caller appends
 * is still there); Wikidata silent → the rows with their search floor (HBO
 * Max, which has none, drops out).
 *
 * HBO Max's old ids (2026-10-03): most of Wikidata's P8298 is still
 * `series/urn:hbo:series:…` | `feature/urn:hbo:feature:…`, which the app
 * doesn't open, but HBO itself 301s them to the live `show|movie/{uuid}`.
 * When TMDB says the title IS on HBO Max in the region and Wikidata has only
 * an old id, HBO is asked for that conversion (`resolveHboLegacyId`) — the one
 * sequential step, with its own short budget, remembered per id.
 *
 * Cache = the framework's fetch data cache (`next: { revalidate }`), no table:
 * the `link_service` enum has no `apple_tv` and the DB is shared with prod.
 * Only a 200 is stored (Next's rule), and a timeout rejects before there is
 * anything to store, so an upstream that didn't answer is asked again on the
 * next view. TMDB's answer carries every region in one body, so it is one
 * entry per title, whatever the viewer's country.
 */

/** Per upstream. The ficha awaits both in parallel, so this is also the worst
 *  case this feature can add to it. */
const UPSTREAM_TIMEOUT_MS = 1_500;
/** Availability changes (a title leaves a service): a day. */
const AVAILABILITY_TTL_S = 60 * 60 * 24;
/** A title's ids on Wikidata almost never change; a week also bounds how long
 *  "Wikidata has no id yet" (a 200 with no rows) is remembered. */
const WIKIDATA_TTL_S = 60 * 60 * 24 * 7;

/** Wikimedia's User-Agent policy: identifiable, with a way to reach us. HBO
 *  gets the same one. */
const WIKIDATA_USER_AGENT = `KuraBot/1.0 (${SITE_URL}; ${SITE_URL}/privacidad#contacto)`;

/** What the ficha may wait for HBO's conversion, both hosts included (they are
 *  asked at once). Measured 0.1–0.6 s; past it the row is simply absent. */
const HBO_BUDGET_MS = 800;
/** How long a conversion is remembered — the id it found, or "HBO doesn't
 *  know that id" (same horizon as Wikidata's "no id yet"). */
const HBO_TTL_S = 60 * 60 * 24 * 7;
/** HBO failed (429/5xx, timeout, network): no calls from this instance until
 *  then, so a slow HBO costs one ficha its budget, not every one. */
let hboPausedUntil = 0;
const HBO_DEFAULT_PAUSE_MS = 60_000;
const HBO_MAX_PAUSE_MS = 15 * 60_000;

/** Wikidata said 429/503 + Retry-After: no calls from this instance until then. */
let wikidataPausedUntil = 0;
const WIKIDATA_DEFAULT_PAUSE_MS = 60_000;
const WIKIDATA_MAX_PAUSE_MS = 15 * 60_000;

/** The region's `flatrate` list, or null when TMDB didn't answer. `[]` is an
 *  answer (not streaming there, or TMDB doesn't know the id). */
async function fetchFlatrate(
  tmdbId: string,
  mediaType: VideoMediaType,
  region: string,
): Promise<unknown[] | null> {
  if (!env.TMDB_API_KEY) return []; // fixtures mode
  if (!/^[0-9]{1,10}$/.test(tmdbId)) return [];
  const kind = mediaType === "film" ? "movie" : "tv";
  const url = new URL(`https://api.themoviedb.org/3/${kind}/${tmdbId}/watch/providers`);
  const headers = tmdbAuth(url, env.TMDB_API_KEY);
  try {
    const res = await fetchWithTimeout(url, {
      headers,
      timeoutMs: UPSTREAM_TIMEOUT_MS,
      next: { revalidate: AVAILABILITY_TTL_S },
    });
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`status ${res.status}`);
    const data = (await res.json()) as { results?: Record<string, { flatrate?: unknown }> } | null;
    // The viewer's country only — no US fallback: a row promises "it's on
    // this service HERE".
    const flatrate = data?.results?.[region]?.flatrate;
    return Array.isArray(flatrate) ? flatrate : [];
  } catch (err) {
    console.warn(`[links] watch providers ${kind}/${tmdbId} not answered, no service rows: ${redactedError(err)}`);
    return null;
  }
}

function pauseWikidata(res: Response) {
  const header = res.headers.get("retry-after");
  const seconds = header ? Number(header) : NaN;
  const ms = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : WIKIDATA_DEFAULT_PAUSE_MS;
  wikidataPausedUntil = Date.now() + Math.min(ms, WIKIDATA_MAX_PAUSE_MS);
}

/** The title's validated service ids, or null when Wikidata didn't answer
 *  (or we are backing off). `{}` is an answer: it has none. */
async function fetchWikidataIds(
  tmdbId: string,
  mediaType: VideoMediaType,
): Promise<WatchServiceIds | null> {
  const query = wikidataIdsQuery(tmdbId, mediaType);
  if (!query) return {};
  if (Date.now() < wikidataPausedUntil) return null;
  const url = new URL("https://query.wikidata.org/sparql");
  url.searchParams.set("query", query);
  url.searchParams.set("format", "json");
  try {
    const res = await fetchWithTimeout(url, {
      headers: { Accept: "application/sparql-results+json", "User-Agent": WIKIDATA_USER_AGENT },
      timeoutMs: UPSTREAM_TIMEOUT_MS,
      next: { revalidate: WIKIDATA_TTL_S },
    });
    if (res.status === 429 || res.status === 503) pauseWikidata(res);
    if (!res.ok) throw new Error(`status ${res.status}`);
    return parseWikidataIds(await res.json(), mediaType);
  } catch (err) {
    console.warn(`[links] wikidata ids for tmdb ${mediaType}/${tmdbId} not answered, search floor served: ${redactedError(err)}`);
    return null;
  }
}

/** Thrown out of the cached function so that `unstable_cache` stores NOTHING:
 *  only an answer from HBO is remembered, never the lack of one. */
class HboUnanswered extends Error {}
/** Backing off after a failure that was already logged when it happened. */
class HboPaused extends HboUnanswered {}

/**
 * One HBO host, one request, never followed: the live id its `Location`
 * names, or null when HBO answered that it has no page for that id (404/410,
 * or a redirect anywhere else — its home page, in practice). Anything that
 * isn't an answer (429, 5xx, an unexpected status, a timeout) throws.
 */
async function askHboHost(url: string, legacyId: string, signal: AbortSignal): Promise<string | null> {
  const res = await fetch(url, {
    method: "HEAD",
    redirect: "manual",
    cache: "no-store",
    signal,
    headers: { "User-Agent": WIKIDATA_USER_AGENT },
  });
  if (res.status >= 300 && res.status < 400) {
    return parseHboRedirectLocation(legacyId, res.headers.get("location"));
  }
  if (res.status === 404 || res.status === 410) return null;
  if (res.status === 429 || res.status >= 500) {
    const seconds = Number(res.headers.get("retry-after") ?? NaN);
    const ms = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : HBO_DEFAULT_PAUSE_MS;
    hboPausedUntil = Date.now() + Math.min(ms, HBO_MAX_PAUSE_MS);
  }
  throw new HboUnanswered(`${new URL(url).hostname} status ${res.status}`);
}

/**
 * Old id → live id, asking HBO's fixed hosts at once under ONE deadline. The
 * first host that names a live page wins; `{ id: null }` only when EVERY host
 * answered that it has none. Otherwise it throws whatever stopped it and
 * pauses this instance (every later ask throws `HboPaused` until then):
 * there is no retry here — the next view of the title is the retry.
 */
async function askHbo(legacyId: string): Promise<{ id: string | null }> {
  const urls = hboLegacyResolveUrls(legacyId);
  if (urls.length === 0) return { id: null };
  if (Date.now() < hboPausedUntil) throw new HboPaused();
  const deadline = AbortSignal.timeout(HBO_BUDGET_MS);
  const asked = urls.map((url) => askHboHost(url, legacyId, deadline));
  try {
    // Resolves with the first live id; rejects once no host can give one.
    return { id: await Promise.any(asked.map((a) => a.then((id) => id ?? Promise.reject(null)))) };
  } catch {
    const settled = await Promise.allSettled(asked);
    const failed = settled.find((s) => s.status === "rejected");
    if (!failed) return { id: null };
    hboPausedUntil = Math.max(hboPausedUntil, Date.now() + HBO_DEFAULT_PAUSE_MS);
    throw failed.reason;
  }
}

/**
 * `askHbo`, remembered. The answer is a computed value (a 301 read with
 * `redirect: "manual"` never enters the fetch data cache, which only stores
 * 200s), so it goes through `unstable_cache` — the same persistent data cache,
 * keyed by the old id: one entry per title, shared by every region and every
 * instance. A throw stores nothing. `"use cache"` would need
 * `cacheComponents`, which this app doesn't enable.
 */
const cachedHboAnswer = unstable_cache(askHbo, ["links:hbo-legacy-id:v1"], { revalidate: HBO_TTL_S });

/** The live HBO Max id of an old one, or null (HBO has none, or didn't answer
 *  in time — logged). Never throws. */
async function resolveHboLegacyId(legacyId: string): Promise<string | null> {
  try {
    return (await cachedHboAnswer(legacyId)).id;
  } catch (err) {
    if (err instanceof HboPaused) return null;
    console.warn(`[links] hbo max conversion of ${legacyId} not answered, no hbo row, hbo paused: ${redactedError(err)}`);
    return null;
  }
}

/**
 * The service rows of a title for a viewer's country — `[]` for an album, a
 * non-TMDB row, a title not streaming on a known service there, or a TMDB
 * that didn't answer in time.
 */
export async function getServiceWatchRows(
  item: Pick<CatalogItemRow, "source" | "externalId" | "mediaType" | "title">,
  region: string,
): Promise<ServiceWatchRow[]> {
  if (item.source !== "tmdb" || (item.mediaType !== "film" && item.mediaType !== "series")) return [];
  const mediaType = item.mediaType;
  // Both leave at once; neither rejects. A title on no known service (most of
  // the catalog) answers as soon as TMDB does, without waiting for Wikidata.
  const idsPending = fetchWikidataIds(item.externalId, mediaType);
  const flatrate = await fetchFlatrate(item.externalId, mediaType, region);
  const services = flatrate ? streamingServices(flatrate) : [];
  if (!flatrate || services.length === 0) return [];
  const ids: WatchServiceIds = { ...((await idsPending) ?? {}) };
  // Only when it can become a row: on HBO Max HERE, and no live id to link to.
  if (!ids.hboMax && ids.hboMaxLegacy && services.includes("hbo_max")) {
    ids.hboMax = (await resolveHboLegacyId(ids.hboMaxLegacy)) ?? undefined;
  }
  return buildServiceRows(flatrate, { title: item.title, mediaType, region, ids });
}

/** The viewer's country from Vercel's header; anything that isn't two letters
 *  (or local dev, where there is no header) is MX. */
export function viewerRegion(headers: Headers): string {
  const raw = headers.get("x-vercel-ip-country")?.toUpperCase() ?? "";
  return /^[A-Z]{2}$/.test(raw) ? raw : "MX";
}

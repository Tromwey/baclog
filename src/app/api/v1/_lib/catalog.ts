import "server-only";
import {
  findCatalogItemByRef,
  getCatalogItem,
  getCatalogReleaseDates,
  type CatalogItemRow,
} from "@/modules/catalog/cache";
import type { ExternalRef } from "./schemas";
import { uuidOrNull } from "./http";

/**
 * A title the app refers to, resolved to its shared `catalog_item` row: the
 * cached catalog id first, or — only as a fallback — the `(source,
 * externalId)` pair the search result carried. Null when the catalog never
 * cached it: the caller answers 404 and asks for a fresh search (the search
 * upsert is what caches; this never calls a provider). Shared by the
 * membership `PUT` and the onboarding picks so a stale id is treated the
 * same on both. A non-UUID id can't be a catalog id, so it skips straight
 * to the ref without a query.
 */
export async function resolveCatalogItem(
  id: string | undefined,
  ref: ExternalRef | undefined,
): Promise<CatalogItemRow | null> {
  const uuid = uuidOrNull(id);
  const byId = uuid ? await getCatalogItem(uuid) : null;
  if (byId) return byId;
  return ref ? findCatalogItemByRef(ref.source, ref.externalId) : null;
}

/**
 * `catalog_item.releaseDate` for summary rows whose module read doesn't carry
 * it (discover rails/trending, feed events, recap, onboarding pool) — one slim
 * query for the whole response. The lookup answers null for an id the catalog
 * doesn't have (then `release` falls back to `year`, like a title with no day).
 */
export async function releaseDatesFor(
  ids: string[],
): Promise<(catalogItemId: string) => Date | null> {
  const dates = await getCatalogReleaseDates(ids);
  return (catalogItemId) => dates.get(catalogItemId) ?? null;
}

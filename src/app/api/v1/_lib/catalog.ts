import "server-only";
import {
  findCatalogItemByRef,
  getCatalogItem,
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

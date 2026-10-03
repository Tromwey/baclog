import { redactedError } from "@/authz/safe-log";
import "server-only";
import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { catalogItems } from "@/db/schema";
import { cacheExternalItems } from "@/modules/catalog/search";
import type { ExternalItem, MediaType } from "@/modules/catalog/types";

/** The catalog facts a Descubrir card needs, keyed by `source:externalId`. */
export interface CatalogRef {
  catalogItemId: string;
  title: string;
  mediaType: MediaType;
  posterUrl: string | null;
  paletteHex: string[] | null;
  releaseDate: Date | null;
}

export const refKey = (e: { source: string; externalId: string }) => `${e.source}:${e.externalId}`;

/**
 * Provider hits → catalog rows (Descubrir, 2026-09-29), writing only what
 * changed. `cacheExternalItems` is the one upsert (it's what gives a hit a
 * `catalogItemId` the app can save), but Descubrir runs on every visit and its
 * provider lists barely move within their 6h cache — so this reads the
 * existing rows first (one query) and upserts ONLY the missing ones and those
 * whose release day moved or that just gained a poster. A steady-state visit
 * is a pure read.
 *
 * A hit whose `(source, externalId)` already names a row of ANOTHER media
 * type is dropped, never upserted: TMDB's movie and TV ids are separate
 * namespaces but the catalog key isn't, and the upsert would retitle the
 * existing row without changing its type.
 *
 * Shared catalog facts only (no user data), same posture as the search upsert.
 * A failed write is logged and the rows that already existed still come back.
 */
export async function ensureCatalogRows(items: ExternalItem[]): Promise<Map<string, CatalogRef>> {
  const byKey = new Map<string, ExternalItem>();
  for (const e of items) if (!byKey.has(refKey(e))) byKey.set(refKey(e), e);
  const out = new Map<string, CatalogRef>();
  if (byKey.size === 0) return out;

  const idsBySource = new Map<"tmdb" | "itunes", string[]>();
  for (const e of byKey.values()) {
    idsBySource.set(e.source, [...(idsBySource.get(e.source) ?? []), e.externalId]);
  }
  const existing = await db
    .select({
      catalogItemId: catalogItems.id,
      source: catalogItems.source,
      externalId: catalogItems.externalId,
      title: catalogItems.title,
      mediaType: catalogItems.mediaType,
      posterUrl: catalogItems.posterUrl,
      paletteHex: catalogItems.paletteHex,
      releaseDate: catalogItems.releaseDate,
    })
    .from(catalogItems)
    .where(
      or(
        ...[...idsBySource].map(([source, ids]) =>
          and(eq(catalogItems.source, source), inArray(catalogItems.externalId, ids)),
        ),
      ),
    );
  const have = new Map(existing.map((r) => [refKey(r), r]));

  const toWrite: ExternalItem[] = [];
  for (const [key, e] of byKey) {
    const row = have.get(key);
    if (!row) {
      toWrite.push(e);
      continue;
    }
    if (row.mediaType !== e.mediaType) {
      byKey.delete(key);
      continue;
    }
    const moved = e.releaseDate !== null && row.releaseDate?.getTime() !== e.releaseDate.getTime();
    const gainedPoster = !row.posterUrl && Boolean(e.posterUrl);
    if (moved || gainedPoster) toWrite.push(e);
    out.set(key, {
      catalogItemId: row.catalogItemId,
      title: row.title,
      mediaType: row.mediaType,
      posterUrl: row.posterUrl ?? e.posterUrl,
      paletteHex: row.paletteHex ?? null,
      // The upsert coalesces: a known incoming day wins, a null keeps ours.
      releaseDate: e.releaseDate ?? row.releaseDate,
    });
  }

  if (toWrite.length > 0) {
    try {
      const written = await cacheExternalItems(toWrite);
      for (const w of written) {
        const key = refKey(w);
        const e = byKey.get(key);
        if (!e) continue;
        out.set(key, {
          catalogItemId: w.catalogItemId,
          title: w.title,
          mediaType: w.mediaType,
          posterUrl: w.posterUrl,
          paletteHex: w.paletteHex,
          releaseDate: e.releaseDate ?? have.get(key)?.releaseDate ?? null,
        });
      }
    } catch (err) {
      console.error("[descubrir] catalog upsert failed:", redactedError(err));
    }
  }
  return out;
}

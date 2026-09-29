import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { backlogItems, backlogs, catalogItems, users } from "@/db/schema";
import { env } from "@/lib/env";
import { byManualOrder, fanHexes, fanOf, type FanCover } from "@/modules/backlog/fan";
import type { MediaType } from "@/modules/catalog/types";
import { notBlockedWith } from "./block-gate";
import { publicAuthor } from "./queries";

/**
 * Descubrir · Kurada (Claude Design "Descubrir Final – Formatos", 2a–2c):
 * "colecciones hechas a mano por el equipo, firmadas con el sello k en miel y
 * el nombre de quien las hizo", one row per format page.
 *
 * The mock asks for a new collection type ("pública, firmada por una cuenta
 * del equipo y fijada por formato"). Until that lands as a schema change, a
 * Kurada is an ordinary collection that is:
 *  - owned by a TEAM account — a username listed in `KURADA_HANDLES`
 *    (env.ts; never `isAdmin`, which is the Torre de Control's gate);
 *  - public (`backlog.is_public`), under the same `publicAuthor` gate as every
 *    cross-user read, and not blocked either way with the viewer;
 *  - filed under the format most of its titles are (a tie goes film → series
 *    → album).
 * Cross-user read WITH a viewer: whitelisted fields only (name, curator's
 * public name/handle, count, the fan's covers).
 */

export interface KuradaCard {
  id: string;
  name: string;
  /** The curator's public name (display name, else @handle). */
  curator: string;
  username: string;
  count: number;
  /** The fan's titles, front first — covers for the web, summaries for the API. */
  fan: (FanCover & {
    catalogItemId: string;
    year: number | null;
    byline: string | null;
    /** ISO, or null — a string so the card crosses the RSC boundary as-is. */
    releaseDate: string | null;
  })[];
  hexes: string[];
}

export type KuradaShelves = Record<MediaType, KuradaCard[]>;

const EMPTY: KuradaShelves = { film: [], series: [], album: [] };

export function kuradaHandles(): string[] {
  return (env.KURADA_HANDLES ?? "")
    .split(",")
    .map((h) => h.trim().replace(/^@/, "").toLowerCase())
    .filter(Boolean);
}

export async function getKuradas(viewerId: string): Promise<KuradaShelves> {
  const handles = kuradaHandles();
  if (handles.length === 0) return EMPTY;

  const lists = await db
    .select({
      id: backlogs.id,
      name: backlogs.name,
      coverCatalogItemId: backlogs.coverCatalogItemId,
      displayName: users.name,
      username: users.username,
    })
    .from(backlogs)
    .innerJoin(
      users,
      and(eq(users.id, backlogs.userId), publicAuthor, notBlockedWith(viewerId, users.id)),
    )
    .where(
      and(
        eq(backlogs.isPublic, true),
        inArray(sql`lower(${users.username})`, handles),
      ),
    )
    .orderBy(desc(backlogs.updatedAt))
    .limit(30);
  if (lists.length === 0) return EMPTY;

  const items = await db
    .select({
      backlogId: backlogItems.backlogId,
      catalogItemId: catalogItems.id,
      title: catalogItems.title,
      year: catalogItems.year,
      byline: catalogItems.byline,
      releaseDate: catalogItems.releaseDate,
      mediaType: catalogItems.mediaType,
      posterUrl: catalogItems.posterUrl,
      paletteHex: catalogItems.paletteHex,
      position: backlogItems.position,
      addedAt: backlogItems.addedAt,
    })
    .from(backlogItems)
    .innerJoin(catalogItems, eq(backlogItems.catalogItemId, catalogItems.id))
    .where(inArray(backlogItems.backlogId, lists.map((l) => l.id)))
    .orderBy(asc(backlogItems.backlogId));

  const byList = new Map<string, typeof items>();
  for (const it of items) {
    const arr = byList.get(it.backlogId) ?? [];
    arr.push(it);
    byList.set(it.backlogId, arr);
  }

  const out: KuradaShelves = { film: [], series: [], album: [] };
  for (const l of lists) {
    const all = (byList.get(l.id) ?? []).sort(byManualOrder);
    if (all.length === 0) continue;
    const tally = { film: 0, series: 0, album: 0 };
    for (const t of all) tally[t.mediaType] += 1;
    const format = (["film", "series", "album"] as const).reduce((best, k) =>
      tally[k] > tally[best] ? k : best,
    );
    const fan = fanOf(all, l.coverCatalogItemId).map((c) => ({
      catalogItemId: c.catalogItemId,
      year: c.year,
      byline: c.byline,
      releaseDate: c.releaseDate ? c.releaseDate.toISOString() : null,
      posterUrl: c.posterUrl,
      paletteHex: c.paletteHex ?? null,
      mediaType: c.mediaType,
      title: c.title,
    }));
    out[format].push({
      id: l.id,
      name: l.name,
      curator: l.displayName?.trim() || `@${l.username}`,
      username: l.username!,
      count: all.length,
      fan,
      hexes: fanHexes(fan, all),
    });
  }
  return out;
}

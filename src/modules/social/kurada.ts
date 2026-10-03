import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { backlogs, users } from "@/db/schema";
import { env } from "@/lib/env";
import type { MediaType } from "@/modules/catalog/types";
import { notBlockedWith } from "./block-gate";
import { collectionCards, type CollectionCard } from "./collection-cards";
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
 *  - ON THE CURATOR'S PROFILE (`backlog.is_public AND show_on_profile`, the
 *    derived "featured" of F3.10.1 — a public-by-link collection is reachable
 *    only by whoever has its URL, and listing it here would publish it),
 *    under the same `publicAuthor` gate as every cross-user read, and not
 *    blocked either way with the viewer;
 *  - filed under the format most of its titles are (`collection-cards.ts`).
 * Cross-user read WITH a viewer: whitelisted fields only (name, curator's
 * public name/handle, count, the fan's covers).
 */

export interface KuradaCard extends CollectionCard {
  /** The curator's public name (= `owner`). */
  curator: string;
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
        eq(backlogs.showOnProfile, true),
        inArray(sql`lower(${users.username})`, handles),
      ),
    )
    .orderBy(desc(backlogs.updatedAt))
    .limit(30);

  const out: KuradaShelves = { film: [], series: [], album: [] };
  for (const c of await collectionCards(lists)) out[c.format].push({ ...c, curator: c.owner });
  return out;
}

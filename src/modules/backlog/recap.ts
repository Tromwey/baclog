import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { catalogItems, userItems } from "@/db/schema";
import { toCardBacklog } from "@/modules/cards/adapter";
import type { CardBacklog } from "@/modules/cards/types";
import { deriveEras } from "./era";
import type { BacklogItemWithCatalog } from "./queries";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Previous full month as an era key ("2026-07" when run on 2026-08-01). */
export function previousMonthKey(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-based; previous month = m-1, wrapping
  const d = new Date(Date.UTC(y, m - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function labelFor(eraKey: string): string {
  return `${MONTHS[Number(eraKey.slice(5)) - 1]} Era`;
}

export interface MonthlyRecap {
  eraKey: string;
  label: string;
  totalItems: number;
  completedCount: number;
  topGenre: string | null;
  cardBacklog: CardBacklog;
}

/**
 * F3.3 — builds a cross-backlog recap for one user + era, reusing the exact
 * M2 pipeline: all the user's items → deriveEras → filter to eraKey →
 * toCardBacklog (so the same receipt/ticket/pattern renderers draw it).
 * Returns null when the user had no activity that month (skip silently).
 */
/**
 * One row per TITLE (user_item) so the recap counts a title filed in two
 * backlogs ONCE. State from user_item, palette from the shared catalog_item.
 */
async function fetchUserItems(
  userId: string,
): Promise<BacklogItemWithCatalog[]> {
  return db
    .select({
      id: userItems.id,
      status: userItems.status,
      verdict: userItems.verdict,
      obsessed: userItems.obsessed,
      sourceCrossMediaRecId: userItems.sourceCrossMediaRecId,
      paletteHex: catalogItems.paletteHex,
      addedAt: userItems.addedAt,
      statusChangedAt: userItems.statusChangedAt,
      catalogItemId: catalogItems.id,
      title: catalogItems.title,
      byline: catalogItems.byline,
      year: catalogItems.year,
      genre: catalogItems.genre,
      mediaType: catalogItems.mediaType,
      posterUrl: catalogItems.posterUrl,
    })
    .from(userItems)
    .innerJoin(catalogItems, eq(userItems.catalogItemId, catalogItems.id))
    .where(eq(userItems.userId, userId))
    .orderBy(desc(userItems.addedAt));
}

function recapFromEra(
  key: string,
  eraItems: BacklogItemWithCatalog[],
  username: string | null,
): MonthlyRecap {
  const label = labelFor(key);
  const genreCounts = new Map<string, number>();
  let completedCount = 0;
  for (const it of eraItems) {
    if (it.status === "completed") completedCount++;
    if (it.genre) genreCounts.set(it.genre, (genreCounts.get(it.genre) ?? 0) + 1);
  }
  const topGenre =
    [...genreCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return {
    eraKey: key,
    label,
    totalItems: eraItems.length,
    completedCount,
    topGenre,
    // Reuse the M2 adapter; the backlog "name" becomes the era label
    cardBacklog: toCardBacklog(label, topGenre, username, eraItems),
  };
}

/** Cron path: the specific previous (or given) month; null if no activity. */
export async function buildMonthlyRecap(
  userId: string,
  eraKey?: string,
  username: string | null = null,
): Promise<MonthlyRecap | null> {
  const key = eraKey ?? previousMonthKey();
  const era = deriveEras(await fetchUserItems(userId)).find((e) => e.key === key);
  if (!era || era.items.length === 0) return null;
  return recapFromEra(key, era.items, username);
}

/** In-app surface: the most recent era with any activity; null if none. */
export async function buildLatestRecap(
  userId: string,
  username: string | null = null,
): Promise<MonthlyRecap | null> {
  const eras = deriveEras(await fetchUserItems(userId));
  const era = eras[0]; // deriveEras sorts most-recent first
  if (!era) return null;
  return recapFromEra(era.key, era.items, username);
}

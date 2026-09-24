import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { itemReviews, userItems } from "@/db/schema";
import { toCardBacklog } from "@/modules/cards/adapter";
import type { CardBacklog } from "@/modules/cards/types";
import { deriveEras } from "./era";
import { getUserLibrary } from "./library";
import type { BacklogItemWithCatalog } from "./queries";
import { monthOf, pickTop, type RecapMonth, type RecapTitle } from "./recap-format";

export type { RecapMonth, RecapTitle } from "./recap-format";

/**
 * Recap reads — F3.3 (the exported card + the monthly cron) and the Kura
 * recap screen / `GET /recap/*` (flujo 10). Every read is over the user's
 * whole library through `getUserLibrary` (one row per `user_item`, so a
 * title filed in two collections counts once) and the same month rule:
 * `deriveEras` (activity = the later of addedAt / statusChangedAt, UTC
 * month). Own-user only — every caller passes the session's id.
 */

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

// ---------- F3.3 card (cron + /recap/tarjeta) ----------

export interface MonthlyRecap {
  eraKey: string;
  label: string;
  totalItems: number;
  completedCount: number;
  topGenre: string | null;
  cardBacklog: CardBacklog;
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

/**
 * F3.3 — builds a cross-backlog recap for one user + era, reusing the exact
 * M2 pipeline: all the user's items → deriveEras → filter to eraKey →
 * toCardBacklog (so the same receipt/ticket/pattern renderers draw it).
 * Returns null when the user had no activity that month (skip silently).
 */
export async function buildMonthlyRecap(
  userId: string,
  eraKey?: string,
  username: string | null = null,
): Promise<MonthlyRecap | null> {
  const key = eraKey ?? previousMonthKey();
  const era = deriveEras(await getUserLibrary(userId)).find((e) => e.key === key);
  if (!era || era.items.length === 0) return null;
  return recapFromEra(key, era.items, username);
}

/** In-app surface: the most recent era with any activity; null if none. */
export async function buildLatestRecap(
  userId: string,
  username: string | null = null,
): Promise<MonthlyRecap | null> {
  const eras = deriveEras(await getUserLibrary(userId));
  const era = eras[0]; // deriveEras sorts most-recent first
  if (!era) return null;
  return recapFromEra(era.key, era.items, username);
}

// ---------- Kura recap screen + GET /recap/* ----------

/**
 * Every month with activity, newest first — what the recap SCREEN and the
 * API read: the covers per month (the card deliberately carries none,
 * ADR-008), the stats, "lo más tuyo", and the list for "Meses anteriores".
 * Reviews are counted by `created_at` month, formatted IN Postgres (the
 * column is `timestamp` without zone, stored UTC).
 */
export async function getRecapMonths(userId: string): Promise<RecapMonth[]> {
  const [items, reviewRows] = await Promise.all([
    getUserLibrary(userId),
    db
      .select({
        month: sql<string>`to_char(${itemReviews.createdAt}, 'YYYY-MM')`,
        n: sql<number>`count(*)::int`,
      })
      .from(itemReviews)
      .where(eq(itemReviews.userId, userId))
      .groupBy(sql`1`),
  ]);

  const reviewsByMonth = new Map(reviewRows.map((r) => [r.month, r.n]));

  return deriveEras(items).map((era) => {
    const titles: RecapTitle[] = era.items.map((it) => ({
      catalogItemId: it.catalogItemId,
      title: it.title,
      byline: it.byline,
      year: it.year,
      mediaType: it.mediaType,
      posterUrl: it.posterUrl,
      paletteHex: it.paletteHex ?? [],
      obsessed: it.obsessed,
      completed: it.status === "completed",
      liked: it.verdict === "liked",
      saved: monthOf(it.addedAt) === era.key,
    }));
    return {
      key: era.key,
      titles,
      completed: titles.filter((t) => t.completed).length,
      obsessions: titles.filter((t) => t.obsessed).length,
      reviews: reviewsByMonth.get(era.key) ?? 0,
      saved: titles.filter((t) => t.saved).length,
      top: pickTop(titles),
    };
  });
}

/** One month by era key; null when the user had no activity then. */
export async function getRecapMonth(
  userId: string,
  eraKey: string,
): Promise<RecapMonth | null> {
  const months = await getRecapMonths(userId);
  return months.find((m) => m.key === eraKey) ?? null;
}

/**
 * The newest month with activity — just its key, for the profile's
 * "recap de {mes}" chip. One aggregate, no rows shipped.
 */
export async function getLatestRecapKey(userId: string): Promise<string | null> {
  // Formatted IN Postgres: the columns are `timestamp` without zone (stored
  // UTC), so reading the raw value back would let the process's TZ shift it
  // (learnings/2026-09-02-date-crudo-en-sql-template-pierde-offset.md).
  const [row] = await db
    .select({
      month: sql<string | null>`to_char(max(greatest(${userItems.addedAt}, ${userItems.statusChangedAt})), 'YYYY-MM')`,
    })
    .from(userItems)
    .where(eq(userItems.userId, userId));
  return row?.month ?? null;
}

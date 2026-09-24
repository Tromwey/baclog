import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { catalogItems, itemReviews, userItems } from "@/db/schema";
import { deriveEras } from "@/modules/backlog/era";
import type { BacklogItemWithCatalog } from "@/modules/backlog/queries";

/**
 * Kura recap (flujo 10) — what the recap SCREEN reads around the F3.3 recap
 * (`modules/backlog/recap.ts`, which feeds the exported card and the cron and
 * is not touched). The screen needs what the card deliberately doesn't carry
 * (ADR-008: CardItem has no artwork): the covers, per month, and the list of
 * months for "Meses anteriores".
 *
 * Same month rule as the card: `deriveEras` (activity = the later of addedAt
 * / statusChangedAt, UTC month), over `user_item` so a title filed in two
 * collections counts once. Own-user only — every caller passes the session's
 * id (requireUser).
 *
 * TODO(state): this select mirrors recap.ts's private `fetchUserItems`; the
 * cleaner home is an export from recap.ts (reported to the orchestrator).
 */

export interface RecapTitle {
  catalogItemId: string;
  title: string;
  byline: string | null;
  mediaType: BacklogItemWithCatalog["mediaType"];
  posterUrl: string | null;
  paletteHex: string[];
  obsessed: boolean;
  completed: boolean;
  liked: boolean;
  /** Added to the library within this month (the "guardados" stat). */
  saved: boolean;
}

export interface RecapMonth {
  /** "2026-08" */
  key: string;
  titles: RecapTitle[];
  completed: number;
  obsessions: number;
  reviews: number;
  saved: number;
  /** The month's "lo más tuyo": obsession first, then a liked completion,
   *  then any completion, then the newest; preferring a title with art. */
  top: RecapTitle | null;
}

const monthOf = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

function pickTop(titles: RecapTitle[]): RecapTitle | null {
  const ranked = [
    (t: RecapTitle) => t.obsessed,
    (t: RecapTitle) => t.completed && t.liked,
    (t: RecapTitle) => t.completed,
    () => true,
  ];
  for (const test of ranked) {
    const hit = titles.find((t) => test(t) && t.posterUrl) ?? titles.find(test);
    if (hit) return hit;
  }
  return null;
}

/** Every month with activity, newest first. */
export async function getRecapMonths(userId: string): Promise<RecapMonth[]> {
  const [items, reviewRows] = await Promise.all([
    db
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
        releaseDate: catalogItems.releaseDate,
        genre: catalogItems.genre,
        mediaType: catalogItems.mediaType,
        posterUrl: catalogItems.posterUrl,
      })
      .from(userItems)
      .innerJoin(catalogItems, eq(userItems.catalogItemId, catalogItems.id))
      .where(eq(userItems.userId, userId))
      .orderBy(desc(userItems.addedAt)),
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

  return deriveEras(items as BacklogItemWithCatalog[]).map((era) => {
    const titles: RecapTitle[] = era.items.map((it) => ({
      catalogItemId: it.catalogItemId,
      title: it.title,
      byline: it.byline,
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

const ES_MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** "2026-08" → "agosto". */
export function monthName(key: string): string {
  return ES_MONTHS[Number(key.slice(5)) - 1] ?? "este mes";
}

/** "2026-08" → "agosto 2026". */
export function monthYear(key: string): string {
  return `${monthName(key)} ${key.slice(0, 4)}`;
}

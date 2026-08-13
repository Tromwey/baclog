import "server-only";
import { desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { catalogItems, itemReviews, reports, users } from "@/db/schema";
import { relativeWhen } from "@/modules/reviews/format";

/**
 * F3.9 — the reviews moderation queue (Torre de Control · /admin/resenas).
 *
 * Read side of the portal's FIRST write capability. Everything here is
 * admin-only by the segment's `requireAdmin()` gate; the queries themselves are
 * cross-user by definition (that IS the job), which is why they live in the
 * admin module and not in modules/reviews — nothing outside /admin may import
 * them.
 */

export interface QueueEntry {
  reviewId: string;
  body: string;
  hasSpoiler: boolean;
  /** Author's @handle — the queue judges a text, but names who wrote it. */
  username: string | null;
  authorIsPublic: boolean;
  title: string;
  /** How many OPEN reports this review carries (0 for an already-hidden row). */
  reportCount: number;
  /** Distinct reasons, in the sheet's own words. */
  reasons: string[];
  /** Nth time this author has had a review reported — repeat-offender context. */
  offense: number;
  when: string;
  hidden: boolean;
}

export interface ReviewQueue {
  pending: QueueEntry[];
  hiddenEntries: QueueEntry[];
  pendingCount: number;
  hiddenCount: number;
  publishedCount: number;
}

const REASON_LABEL: Record<string, string> = {
  unmarked_spoiler: "spoiler sin marcar",
  spam: "spam",
  harassment: "acoso",
  hate: "odio o discriminación",
  illegal_content: "contenido ilegal",
  off_topic: "no habla de la obra",
  impersonation: "suplantación",
  other: "otro",
};

/**
 * One pass over the reported reviews, split into "pending" (open reports) and
 * "hidden" (already acted on, restorable). Both sides carry the same shape so
 * the page renders one card component.
 */
export async function getReviewQueue(now = Date.now()): Promise<ReviewQueue> {
  const rows = await db
    .select({
      reviewId: itemReviews.id,
      body: itemReviews.body,
      hasSpoiler: itemReviews.hasSpoiler,
      hiddenAt: itemReviews.hiddenAt,
      createdAt: itemReviews.createdAt,
      authorId: itemReviews.userId,
      username: users.username,
      authorIsPublic: users.isPublic,
      title: catalogItems.title,
      openReports: sql<number>`count(*) filter (where ${reports.resolvedAt} is null)::int`,
      lastReportAt: sql<Date | null>`max(${reports.createdAt})`,
      reasons: sql<
        string[]
      >`array_agg(distinct ${reports.reason}::text) filter (where ${reports.resolvedAt} is null)`,
      // A hidden review's reports are all closed, so the open-reason list is
      // empty for it — the card still has to say WHY it was hidden.
      allReasons: sql<string[]>`array_agg(distinct ${reports.reason}::text)`,
    })
    .from(reports)
    .innerJoin(itemReviews, eq(reports.targetReviewId, itemReviews.id))
    .innerJoin(users, eq(itemReviews.userId, users.id))
    .innerJoin(catalogItems, eq(itemReviews.catalogItemId, catalogItems.id))
    .where(isNotNull(reports.targetReviewId))
    .groupBy(
      itemReviews.id,
      users.id,
      catalogItems.id,
    )
    .orderBy(desc(sql`max(${reports.createdAt})`));

  // "2.ª vez" — how many DISTINCT reviews of this author have ever been
  // reported. Computed here from the same rows: the queue is small by
  // construction (a report is rare), so this costs nothing and needs no
  // second query.
  const offenseOrder = new Map<string, number>();
  const byAuthor = new Map<string, string[]>();
  for (const row of [...rows].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  )) {
    const list = byAuthor.get(row.authorId) ?? [];
    list.push(row.reviewId);
    byAuthor.set(row.authorId, list);
    offenseOrder.set(row.reviewId, list.length);
  }

  const toEntry = (row: (typeof rows)[number]): QueueEntry => ({
    reviewId: row.reviewId,
    body: row.body,
    hasSpoiler: row.hasSpoiler,
    username: row.username,
    authorIsPublic: row.authorIsPublic,
    title: row.title,
    reportCount: row.openReports,
    reasons: ((row.hiddenAt !== null ? row.allReasons : row.reasons) ?? [])
      .filter(Boolean)
      .map((r) => REASON_LABEL[r] ?? r),
    offense: offenseOrder.get(row.reviewId) ?? 1,
    when: relativeWhen(row.lastReportAt ?? row.createdAt, now),
    hidden: row.hiddenAt !== null,
  });

  const [published] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(itemReviews)
    .where(isNull(itemReviews.hiddenAt));
  const [hiddenTotal] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(itemReviews)
    .where(isNotNull(itemReviews.hiddenAt));

  const pending = rows.filter((r) => r.hiddenAt === null && r.openReports > 0);
  const hiddenEntries = rows.filter((r) => r.hiddenAt !== null);

  return {
    pending: pending.map(toEntry),
    hiddenEntries: hiddenEntries.map(toEntry),
    pendingCount: pending.length,
    hiddenCount: hiddenTotal?.n ?? 0,
    publishedCount: published?.n ?? 0,
  };
}

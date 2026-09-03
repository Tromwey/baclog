import "server-only";
import { and, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { itemReviews, userItems, users } from "@/db/schema";
import type { MediaType } from "@/modules/catalog/types";
import { FALLBACK_ADN } from "@/modules/reviews/format";
import { avatarHexesFor, initialOf } from "@/modules/reviews/queries";
import { getFollowedIds, publicAuthor } from "./queries";

/**
 * "Entre quienes sigues" (Revamp UI 06, 2026-09-03) — the people the viewer
 * follows who have done something with THIS title: reviewed it, are obsessed
 * with it, completed it, or liked it. One row per person, most recent first,
 * plus the total so the header can say "· 4" while the list shows the top few.
 *
 * Cross-user read, so it follows the social module's posture to the letter:
 * the followed set comes from the viewer's own follow rows, and every row is
 * re-gated on `publicAuthor` INSIDE the query (a followed profile that went
 * private vanishes here the same instant it vanishes from the feed) with an
 * explicit public-safe field list — handle, photo, and the reaction the
 * person volunteered. A "no me gustó" is NEVER surfaced: someone whose only
 * signal is a dislike isn't in the result at all, and a reviewer with a
 * dislike gets no glyph rather than the flipped thumb.
 */

export type ActivityState = "obsessed" | "done" | "liked";

export interface TitleActivityRow {
  username: string;
  initial: string;
  avatarHexes: [string, string];
  avatarUrl: string | null;
  /** "la reseñó" · "le obsesiona" · "la completó" · "le gustó" (lo/la by kind). */
  what: string;
  /** The glyph beside the row; null when the person cleared their reaction. */
  state: ActivityState | null;
}

export interface TitleActivity {
  rows: TitleActivityRow[];
  total: number;
}

type EventKind = "reviewed" | "obsessed" | "completed" | "liked";

/** Películas y series se completan en femenino; un álbum, en masculino. */
function verb(kind: EventKind, mediaType: MediaType): string {
  const it = mediaType === "album" ? "lo" : "la";
  switch (kind) {
    case "reviewed":
      return `${it} reseñó`;
    case "obsessed":
      return "le obsesiona";
    case "completed":
      return `${it} completó`;
    case "liked":
      return "le gustó";
  }
}

export async function getTitleActivityAmongFollowed(
  viewerId: string,
  catalogItemId: string,
  { limit = 4, mediaType }: { limit?: number; mediaType: MediaType },
): Promise<TitleActivity> {
  const followed = await getFollowedIds(viewerId);
  if (followed.length === 0) return { rows: [], total: 0 };

  const rows = await db
    .select({
      userId: userItems.userId,
      username: users.username,
      image: users.image,
      obsessed: userItems.obsessed,
      obsessedAt: userItems.obsessedAt,
      verdict: userItems.verdict,
      verdictChangedAt: userItems.verdictChangedAt,
      status: userItems.status,
      statusChangedAt: userItems.statusChangedAt,
      addedAt: userItems.addedAt,
      reviewedAt: itemReviews.createdAt,
    })
    .from(userItems)
    .innerJoin(users, and(eq(users.id, userItems.userId), publicAuthor))
    .leftJoin(
      itemReviews,
      and(
        eq(itemReviews.userId, userItems.userId),
        eq(itemReviews.catalogItemId, userItems.catalogItemId),
        isNull(itemReviews.hiddenAt),
      ),
    )
    .where(
      and(
        eq(userItems.catalogItemId, catalogItemId),
        inArray(userItems.userId, followed),
        or(
          eq(userItems.obsessed, true),
          eq(userItems.verdict, "liked"),
          eq(userItems.status, "completed"),
          isNotNull(itemReviews.id),
        ),
      ),
    );

  // The row's headline is its MOST RECENT event; the glyph is the state that
  // event implies (a review shows the reviewer's own mark, like its card).
  const ranked = rows
    .map((row) => {
      const events: { kind: EventKind; at: number }[] = [];
      if (row.reviewedAt)
        events.push({ kind: "reviewed", at: row.reviewedAt.getTime() });
      if (row.obsessed)
        events.push({
          kind: "obsessed",
          at: (row.obsessedAt ?? row.addedAt).getTime(),
        });
      if (row.status === "completed")
        events.push({ kind: "completed", at: row.statusChangedAt.getTime() });
      if (row.verdict === "liked")
        events.push({
          kind: "liked",
          at: (row.verdictChangedAt ?? row.addedAt).getTime(),
        });
      events.sort((a, b) => b.at - a.at);
      const latest = events[0];
      if (!latest) return null;

      let state: ActivityState | null;
      if (latest.kind === "reviewed") {
        state = row.obsessed
          ? "obsessed"
          : row.verdict === "liked"
            ? "liked"
            : row.status === "completed"
              ? "done"
              : null;
      } else if (latest.kind === "completed") state = "done";
      else state = latest.kind;

      return { row, at: latest.at, what: verb(latest.kind, mediaType), state };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => b.at - a.at);

  const top = ranked.slice(0, limit);
  const hexes = await avatarHexesFor([...new Set(top.map((r) => r.row.userId))]);

  return {
    total: ranked.length,
    rows: top.map(({ row, what, state }) => {
      const username = row.username ?? "";
      return {
        username,
        initial: initialOf(username),
        avatarHexes: hexes.get(row.userId) ?? FALLBACK_ADN,
        avatarUrl: row.image,
        what,
        state,
      };
    }),
  };
}

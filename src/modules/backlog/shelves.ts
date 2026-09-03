import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { backlogItems, backlogs, catalogItems, userItems } from "@/db/schema";
import type { MediaType } from "@/modules/catalog/types";

/**
 * The /backlogs list (Revamp UI screen 02, 2026-09-03): every backlog of the
 * user as a strip of covers wearing their state, plus the progress line under
 * it. Own-user only — the caller passes the session's id.
 *
 * Two round trips, grouped in JS: the backlogs (newest first, same order as
 * getBacklogsForUser so the picker and the list agree) and ALL of the user's
 * memberships joined to their per-title state (`user_item`) and the shared
 * cover facts (`catalog_item`) — AGENTS.md: state never lives on
 * `backlog_item`, palette never on `user_item`. Counts are computed from every
 * membership; only the covers themselves are capped (newest first), because
 * the strip shows a dozen at most and the client filters them by kind.
 */

export interface ShelfCover {
  backlogItemId: string;
  catalogItemId: string;
  title: string;
  mediaType: MediaType;
  posterUrl: string | null;
  paletteHex: string[] | null;
  status: string;
  verdict: "liked" | "disliked" | null;
  obsessed: boolean;
  /** ISO string, or null when the catalog has no date. */
  releaseDate: string | null;
}

export interface KindCount {
  total: number;
  done: number;
}

export interface Shelf {
  id: string;
  name: string;
  vibe: string | null;
  isPublic: boolean;
  showOnProfile: boolean;
  itemCount: number;
  doneCount: number;
  /** Totals per kind, so the client's Cine/Series/Música filter can keep the
   *  progress line honest without shipping every membership. */
  byKind: Record<MediaType, KindCount>;
  /** Newest first, capped at COVER_CAP. */
  covers: ShelfCover[];
}

/** More than the strip shows (12) so a kind filter still finds a full row. */
const COVER_CAP = 24;

const emptyByKind = (): Record<MediaType, KindCount> => ({
  film: { total: 0, done: 0 },
  series: { total: 0, done: 0 },
  album: { total: 0, done: 0 },
});

export async function getShelvesForUser(userId: string): Promise<Shelf[]> {
  const rows = await db
    .select({
      id: backlogs.id,
      name: backlogs.name,
      vibe: backlogs.vibe,
      isPublic: backlogs.isPublic,
      showOnProfile: backlogs.showOnProfile,
    })
    .from(backlogs)
    .where(eq(backlogs.userId, userId))
    .orderBy(desc(backlogs.createdAt));

  if (rows.length === 0) return [];

  const memberships = await db
    .select({
      backlogId: backlogItems.backlogId,
      backlogItemId: backlogItems.id,
      catalogItemId: catalogItems.id,
      title: catalogItems.title,
      mediaType: catalogItems.mediaType,
      posterUrl: catalogItems.posterUrl,
      paletteHex: catalogItems.paletteHex,
      releaseDate: catalogItems.releaseDate,
      status: userItems.status,
      verdict: userItems.verdict,
      obsessed: userItems.obsessed,
    })
    .from(backlogItems)
    .innerJoin(catalogItems, eq(backlogItems.catalogItemId, catalogItems.id))
    .innerJoin(
      userItems,
      // Composite join on (userId, catalogItemId): the per-title row is one
      // per user, shared by every backlog the title is filed under.
      and(
        eq(userItems.userId, backlogItems.userId),
        eq(userItems.catalogItemId, backlogItems.catalogItemId),
      ),
    )
    .where(eq(backlogItems.userId, userId))
    .orderBy(desc(backlogItems.addedAt));

  const shelves = new Map<string, Shelf>(
    rows.map((r) => [
      r.id,
      {
        ...r,
        itemCount: 0,
        doneCount: 0,
        byKind: emptyByKind(),
        covers: [],
      },
    ]),
  );

  for (const m of memberships) {
    const shelf = shelves.get(m.backlogId);
    if (!shelf) continue;
    const done = m.status === "completed";
    shelf.itemCount += 1;
    shelf.byKind[m.mediaType].total += 1;
    if (done) {
      shelf.doneCount += 1;
      shelf.byKind[m.mediaType].done += 1;
    }
    if (shelf.covers.length < COVER_CAP) {
      shelf.covers.push({
        backlogItemId: m.backlogItemId,
        catalogItemId: m.catalogItemId,
        title: m.title,
        mediaType: m.mediaType,
        posterUrl: m.posterUrl,
        paletteHex: m.paletteHex ?? null,
        status: m.status,
        verdict: m.verdict,
        obsessed: m.obsessed,
        releaseDate: m.releaseDate ? m.releaseDate.toISOString() : null,
      });
    }
  }

  return rows.map((r) => shelves.get(r.id)!);
}

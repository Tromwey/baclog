import "server-only";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  catalogItems,
  crossMediaRecSeen,
  crossMediaRecs,
  userItems,
} from "@/db/schema";
import type { MediaType } from "@/modules/catalog/types";

/**
 * Own-profile reads (Revamp UI screen 09, 2026-09-03). Every function is
 * scoped by `userId` INSIDE the query and every caller passes the session's
 * id (requireUser) — nothing here is reachable for another account. All keyed
 * on `user_item` (per-title state, one row per title however many backlogs
 * it's filed under — AGENTS.md), so a title never counts twice.
 */

/** The three stat pills: me gustó · obsesión · completado. */
export interface ReactionCounts {
  liked: number;
  obsessed: number;
  completed: number;
}

export async function getReactionCounts(userId: string): Promise<ReactionCounts> {
  const [row] = await db
    .select({
      liked: sql<number>`(count(*) filter (where ${userItems.verdict} = 'liked'))::int`,
      obsessed: sql<number>`(count(*) filter (where ${userItems.obsessed}))::int`,
      completed: sql<number>`(count(*) filter (where ${userItems.status} = 'completed'))::int`,
    })
    .from(userItems)
    .where(eq(userItems.userId, userId));
  return {
    liked: row?.liked ?? 0,
    obsessed: row?.obsessed ?? 0,
    completed: row?.completed ?? 0,
  };
}

export interface ObsessionTile {
  catalogItemId: string;
  title: string;
  mediaType: MediaType;
  posterUrl: string | null;
  paletteHex: string[] | null;
}

/** "Obsesiones actuales" — what obsesses them right now, newest first. */
export async function getObsessions(
  userId: string,
  limit = 12,
): Promise<ObsessionTile[]> {
  return db
    .select({
      catalogItemId: catalogItems.id,
      title: catalogItems.title,
      mediaType: catalogItems.mediaType,
      posterUrl: catalogItems.posterUrl,
      paletteHex: catalogItems.paletteHex,
    })
    .from(userItems)
    .innerJoin(catalogItems, eq(catalogItems.id, userItems.catalogItemId))
    .where(and(eq(userItems.userId, userId), eq(userItems.obsessed, true)))
    .orderBy(desc(userItems.obsessedAt), desc(userItems.addedAt))
    .limit(limit);
}

/**
 * What the "Tus tarjetas" fan prints: the receipt's month count, the latest
 * double feature the account was shown, and the most recently completed
 * title for the ticket. Three small reads in one round-trip.
 */
export interface ProfileCards {
  /** Titles added to the library since the 1st of the current month. */
  monthCount: number;
  /** "{seed} × {target}" of the most recent double feature shown; null until
   *  Descubrir has served one. */
  doubleFeature: { seedTitle: string; targetTitle: string } | null;
  /** The last title marked completed, for the ticket. */
  latestCompleted: { catalogItemId: string; title: string } | null;
}

export async function getProfileCards(
  userId: string,
  now: number,
): Promise<ProfileCards> {
  const monthStart = new Date(now);
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const seed = alias(catalogItems, "seed_item");
  const target = alias(catalogItems, "target_item");

  const [[month], [df], [completed]] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(userItems)
      .where(and(eq(userItems.userId, userId), gte(userItems.addedAt, monthStart))),
    // The double feature is what Descubrir last SHOWED this account (the
    // seen row is per user; the rec itself is a shared cache of pairings).
    db
      .select({ seedTitle: seed.title, targetTitle: target.title })
      .from(crossMediaRecSeen)
      .innerJoin(crossMediaRecs, eq(crossMediaRecs.id, crossMediaRecSeen.crossMediaRecId))
      .innerJoin(seed, eq(seed.id, crossMediaRecs.seedCatalogItemId))
      .innerJoin(target, eq(target.id, crossMediaRecs.targetCatalogItemId))
      .where(eq(crossMediaRecSeen.userId, userId))
      .orderBy(desc(crossMediaRecSeen.seenAt))
      .limit(1),
    db
      .select({ catalogItemId: catalogItems.id, title: catalogItems.title })
      .from(userItems)
      .innerJoin(catalogItems, eq(catalogItems.id, userItems.catalogItemId))
      .where(and(eq(userItems.userId, userId), eq(userItems.status, "completed")))
      .orderBy(desc(userItems.statusChangedAt))
      .limit(1),
  ]);

  return {
    monthCount: month?.n ?? 0,
    doubleFeature: df ?? null,
    latestCompleted: completed ?? null,
  };
}

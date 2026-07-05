import "server-only";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { db } from "@/db";
import { backlogItems, catalogItems } from "@/db/schema";
import { env } from "@/lib/env";

export interface Suggestion {
  catalogItemId: string;
  title: string;
  byline: string | null;
  year: number | null;
  mediaType: "film" | "series" | "album";
  posterUrl: string | null;
}

/**
 * F2.20 — content-based suggestions "for this backlog", presented as AI.
 * With a TMDB key: /similar on up to two video seeds, upserted into the
 * shared cache. Without: genre-match against catalog_items (whatever the
 * cache already knows). Never suggests something already in the backlog.
 */
export async function getSuggestionsForBacklog(
  backlogId: string,
): Promise<Suggestion[]> {
  const existing = await db
    .select({
      catalogItemId: backlogItems.catalogItemId,
      genre: catalogItems.genre,
      mediaType: catalogItems.mediaType,
      source: catalogItems.source,
      externalId: catalogItems.externalId,
    })
    .from(backlogItems)
    .innerJoin(catalogItems, eq(backlogItems.catalogItemId, catalogItems.id))
    .where(eq(backlogItems.backlogId, backlogId));

  if (existing.length === 0) return [];
  const excludeIds = existing.map((e) => e.catalogItemId);

  if (env.TMDB_API_KEY) {
    const seeds = existing
      .filter(
        (e): e is (typeof existing)[number] & { mediaType: "film" | "series" } =>
          e.source === "tmdb" && e.mediaType !== "album",
      )
      .slice(0, 2);
    const fetched = (
      await Promise.all(seeds.map((s) => fetchSimilar(s.externalId, s.mediaType)))
    ).flat();
    if (fetched.length > 0) {
      const rows = await db
        .insert(catalogItems)
        .values(fetched)
        .onConflictDoNothing()
        .returning();
      // onConflictDoNothing returns only new rows; refetch the full set
      const all = await db
        .select()
        .from(catalogItems)
        .where(
          and(
            inArray(
              catalogItems.externalId,
              fetched.map((f) => f.externalId),
            ),
            eq(catalogItems.source, "tmdb"),
            notInArray(catalogItems.id, excludeIds),
          ),
        )
        .limit(10);
      void rows;
      return all.map(toSuggestion);
    }
  }

  // Fixture/cold-start path: same-genre items already in the shared cache
  const genres = [...new Set(existing.map((e) => e.genre).filter(Boolean))] as string[];
  if (genres.length === 0) return [];
  const matches = await db
    .select()
    .from(catalogItems)
    .where(
      and(
        inArray(catalogItems.genre, genres),
        notInArray(catalogItems.id, excludeIds),
      ),
    )
    .limit(10);
  return matches.map(toSuggestion);
}

function toSuggestion(row: typeof catalogItems.$inferSelect): Suggestion {
  return {
    catalogItemId: row.id,
    title: row.title,
    byline: row.byline,
    year: row.year,
    mediaType: row.mediaType,
    posterUrl: row.posterUrl,
  };
}

async function fetchSimilar(
  tmdbId: string,
  mediaType: "film" | "series",
): Promise<(typeof catalogItems.$inferInsert)[]> {
  try {
    const kind = mediaType === "film" ? "movie" : "tv";
    const url = new URL(`https://api.themoviedb.org/3/${kind}/${tmdbId}/similar`);
    const headers: HeadersInit = {};
    if (env.TMDB_API_KEY!.startsWith("eyJ")) {
      headers.Authorization = `Bearer ${env.TMDB_API_KEY}`;
    } else {
      url.searchParams.set("api_key", env.TMDB_API_KEY!);
    }
    const res = await fetch(url, { headers, next: { revalidate: 0 } });
    if (!res.ok) return [];
    const data = await res.json();
    interface R {
      id: number;
      title?: string;
      name?: string;
      release_date?: string;
      first_air_date?: string;
      overview?: string;
      poster_path?: string | null;
      vote_average?: number;
    }
    return (data.results as R[]).slice(0, 8).map((r) => ({
      source: "tmdb",
      externalId: String(r.id),
      mediaType,
      title: r.title ?? r.name ?? "Untitled",
      byline: null,
      year: Number((r.release_date ?? r.first_air_date ?? "").slice(0, 4)) || null,
      genre: null,
      synopsis: r.overview || null,
      posterUrl: r.poster_path
        ? `https://image.tmdb.org/t/p/w342${r.poster_path}`
        : null,
      sourceRating: r.vote_average ?? null,
      raw: r,
    }));
  } catch {
    return [];
  }
}

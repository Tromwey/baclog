import type { ExternalItem } from "./types";

/**
 * Fixture catalog used when TMDB_API_KEY is absent (build/test never blocks
 * on the founder's TMDB commercial approval). Shapes mirror real TMDB
 * responses; posterUrl is null on purpose — fixtures must not hotlink
 * TMDB's CDN without an API relationship.
 */
export const TMDB_FIXTURES: ExternalItem[] = [
  fx("film", "693134", "Dune: Part Two", "Legendary", 2024, "sci-fi", 8.2,
    "Paul Atreides unites with Chani and the Fremen while seeking revenge."),
  fx("film", "937287", "Challengers", "MGM", 2024, "drama", 7.1,
    "A tennis player turned coach positions her husband against her ex."),
  fx("film", "666277", "Past Lives", "A24", 2023, "romance", 7.8,
    "Two childhood friends reunite in New York for one fateful week."),
  fx("film", "615656", "Everything Everywhere All at Once", "A24", 2022,
    "sci-fi", 7.8, "A laundromat owner is swept into a multiversal battle."),
  fx("film", "872585", "Oppenheimer", "Universal", 2023, "drama", 8.1,
    "The story of J. Robert Oppenheimer and the atomic bomb."),
  fx("series", "136315", "The Bear", "FX", 2022, "drama", 8.5,
    "A young chef returns to Chicago to run his family's sandwich shop."),
  fx("series", "95396", "Severance", "Apple TV+", 2022, "thriller", 8.4,
    "Employees whose memories are split between work and personal lives."),
  fx("series", "94997", "House of the Dragon", "HBO", 2022, "fantasy", 8.4,
    "The Targaryen civil war, 200 years before the events of Westeros."),
  fx("series", "119051", "Wednesday", "Netflix", 2022, "mystery", 8.0,
    "Wednesday Addams investigates a monstrous mystery at Nevermore."),
  fx("series", "1396", "Breaking Bad", "AMC", 2008, "crime", 8.9,
    "A chemistry teacher turned methamphetamine manufacturer."),
];

function fx(
  mediaType: "film" | "series",
  externalId: string,
  title: string,
  byline: string,
  year: number,
  genre: string,
  sourceRating: number,
  synopsis: string,
): ExternalItem {
  return {
    source: "tmdb",
    externalId,
    mediaType,
    title,
    byline,
    year,
    genre,
    synopsis,
    posterUrl: null,
    sourceRating,
    isrc: null,
    upc: null,
    raw: { fixture: true },
  };
}

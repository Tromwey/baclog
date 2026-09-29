import type { MediaType } from "./types";

/**
 * Descubrir · por formato (Claude Design "Descubrir Final – Formatos", 2a–2c)
 * — the shapes the three format pages read and the vocabularies they filter
 * with. PURE module (no DB, no fetch, no "server-only"): the server fetchers
 * in `format-shelves.ts` and the client page share it, so a mood can never
 * mean one thing on the server and another on screen.
 *
 * "Los humores de cine, como los momentos de música, saldrían de mapear género
 * y paleta" — a mood is a set of TMDB genre ids (cine) or of Apple genre-name
 * fragments (música), plus the two tones its swatch and the page tint wear
 * once it's picked. The tones are the mock's; they belong to the MOOD, not to
 * any cover, which is why they are fixed here.
 */

/** One title on a format shelf — everything "guardar" and the ficha need. */
export interface ShelfWork {
  catalogItemId: string;
  title: string;
  mediaType: MediaType;
  posterUrl: string | null;
  paletteHex: string[] | null;
  year: number | null;
  byline: string | null;
}

/** 2a — a film with what the time and mood questions filter on. */
export interface CineWork extends ShelfWork {
  /** Minutes; null when TMDB doesn't know it yet (the pill hides). */
  runtime: number | null;
  genreIds: number[];
  /** Our genre slug (`TMDB_GENRES`), for the meta line. */
  genre: string | null;
  /** Released in the last few weeks — the meta line says "En cines". */
  inCinemas: boolean;
}

/** 2b — a finished miniseries, sized for a marathon. */
export interface SeriesWork extends ShelfWork {
  episodes: number;
  /** Whole-series running time in minutes. */
  minutes: number;
  network: string | null;
}

/** 2c — an album from the charts, with the genre its moment is read from. */
export interface AlbumWork extends ShelfWork {
  genre: string | null;
}

/** 2a · "¿cuánto tiempo tienes?" — three runtime windows, in minutes. */
export const CINE_TIMES = [
  { label: "una hora y algo", sub: "menos de 100 min", runtime: { lte: 99 } },
  { label: "hasta dos horas", sub: "100 a 130 min", runtime: { gte: 100, lte: 130 } },
  { label: "sin prisa", sub: "más de 130 min", runtime: { gte: 131 } },
] as const;

export type CineTime = 0 | 1 | 2;

export const isCineTime = (n: unknown): n is CineTime => n === 0 || n === 1 || n === 2;

/** 2a · "¿y de qué humor?" — optional; tapping the picked one again clears it. */
export const CINE_MOODS: { label: string; hexes: [string, string]; genres: number[] }[] = [
  // drama · romance
  { label: "para llorar", hexes: ["#5a7aa0", "#101a2a"], genres: [18, 10749] },
  // thriller · horror · mystery
  { label: "con el corazón en la boca", hexes: ["#c7462f", "#3a1a14"], genres: [53, 27, 9648] },
  // comedy
  { label: "para reír", hexes: ["#e8b23a", "#5a3a10"], genres: [35] },
  // animation · family · music
  { label: "lenta y bonita", hexes: ["#8aa05a", "#20301a"], genres: [16, 10751, 10402] },
  // sci-fi · documentary · history
  { label: "para pensar", hexes: ["#9b4dca", "#2a1440"], genres: [878, 99, 36] },
];

export const inCineMood = (mood: number | null, w: Pick<CineWork, "genreIds">) =>
  mood === null || w.genreIds.some((g) => CINE_MOODS[mood]?.genres.includes(g));

/** 2b · the marathon lenses — the whole series has to fit in the window. */
export const SERIES_LENSES = [
  { label: "una tarde", sub: "hasta 5 h", maxMinutes: 5 * 60 },
  { label: "un fin de semana", sub: "hasta 12 h", maxMinutes: 12 * 60 },
] as const;

/**
 * 2c · "¿para qué momento?" — matched against the chart's genre name,
 * lowercased (Apple names them per storefront, so both "electronic" and
 * "electrónica" appear: fragments, not exact names). An album can belong to
 * more than one moment.
 */
export const MUSIC_MOODS: { label: string; hexes: [string, string]; genres: string[] }[] = [
  { label: "de noche", hexes: ["#3a4ab0", "#0e1030"], genres: ["r&b", "soul", "alternativ", "electr", "indie"] },
  {
    label: "para concentrarte",
    hexes: ["#6a9a8a", "#102a22"],
    genres: ["jazz", "clásic", "classical", "ambient", "instrumental", "banda sonora", "soundtrack", "new age", "electr"],
  },
  {
    label: "para bailar",
    hexes: ["#e07aa0", "#401a2a"],
    genres: ["pop", "dance", "urban", "reggaet", "tropical", "latin", "house"],
  },
  {
    label: "domingo lento",
    hexes: ["#d9a86a", "#3a2a16"],
    genres: ["folk", "cantautor", "singer", "country", "acústic", "acoustic", "mexican", "regional", "bolero", "vocal"],
  },
  { label: "con rabia", hexes: ["#c7462f", "#3a1a14"], genres: ["rock", "metal", "punk", "hip-hop", "rap", "hardcore"] },
];

export const inMusicMood = (mood: number, genre: string | null) =>
  Boolean(genre) && (MUSIC_MOODS[mood]?.genres.some((g) => genre!.includes(g)) ?? false);

/** Our TMDB genre slugs, in Spanish, for the film meta line. */
export const GENRE_ES: Record<string, string> = {
  action: "Acción",
  adventure: "Aventura",
  animation: "Animación",
  comedy: "Comedia",
  crime: "Crimen",
  documentary: "Documental",
  drama: "Drama",
  family: "Familiar",
  fantasy: "Fantasía",
  history: "Historia",
  horror: "Terror",
  music: "Música",
  mystery: "Misterio",
  romance: "Romance",
  "sci-fi": "Ciencia ficción",
  thriller: "Thriller",
  war: "Bélica",
  western: "Western",
};

/** "3,9 h" / "12 h" — the marathon pill, one decimal, Spanish comma. */
export function hoursLabel(minutes: number): string {
  const h = Math.round((minutes / 60) * 10) / 10;
  return `${String(h).replace(".", ",")} h`;
}

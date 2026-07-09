import type { CardBacklog } from "@/modules/cards/types";

/** M1: hardcoded backlog — 2 films, 2 albums, 1 series, 1 extra album (F1.1). */
export const DEMO_BACKLOG: CardBacklog = {
  name: "Summer Era",
  username: "eric",
  items: [
    {
      title: "Dune: Part Two",
      byline: "Legendary",
      type: "film",
      year: 2024,
      genre: "sci-fi",
      mood: "epic",
      status: "completed",
      reaction: "obsessed",
    },
    {
      title: "Challengers",
      byline: "MGM",
      type: "film",
      year: 2024,
      genre: "drama",
      mood: "tension",
      status: "in-progress",
      reaction: "obsessed",
    },
    {
      title: "BRAT",
      byline: "Charli XCX",
      type: "album",
      year: 2024,
      genre: "hyperpop",
      mood: "chaotic",
      status: "completed",
      reaction: "obsessed",
    },
    {
      title: "Hit Me Hard and Soft",
      byline: "Billie Eilish",
      type: "album",
      year: 2024,
      genre: "alt-pop",
      mood: "dreamy",
      status: "in-progress",
      reaction: "obsessed",
    },
    {
      title: "The Bear",
      byline: "FX",
      type: "series",
      year: 2026,
      genre: "drama",
      mood: "stress",
      status: "on-my-radar",
    },
    {
      title: "GNX",
      byline: "Kendrick Lamar",
      type: "album",
      year: 2024,
      genre: "hip-hop",
      mood: "hard",
      status: "on-my-radar",
    },
  ],
};

/** A second backlog only used to verify F1.4: different data → visibly different pattern. */
export const ALT_BACKLOG: CardBacklog = {
  name: "Rainy Nights",
  username: "eric",
  items: [
    {
      title: "Past Lives",
      byline: "A24",
      type: "film",
      year: 2023,
      genre: "romance",
      mood: "melancholy",
      status: "completed",
      reaction: "liked",
    },
    {
      title: "SOS",
      byline: "SZA",
      type: "album",
      year: 2022,
      genre: "r&b",
      mood: "moody",
      status: "in-progress",
      reaction: "obsessed",
    },
    {
      title: "Severance",
      byline: "Apple TV+",
      type: "series",
      year: 2025,
      genre: "thriller",
      mood: "eerie",
      status: "on-my-radar",
    },
  ],
};

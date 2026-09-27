import type { CardBacklog } from "@/modules/cards/types";

/**
 * The card lab's sample collection: one of each format and every state the
 * shareable cards print (me obsesiona, me gusta, completo, no puedo esperar,
 * only saved). Palettes are two-tone hexes in the shape
 * `catalog_item.paletteHex` stores, so the tint recipes render as they do
 * with real data.
 */
export const DEMO_BACKLOG: CardBacklog = {
  name: "lo que me rompió este verano",
  vibe: "lo que te rompe y lo agradeces",
  username: "sofi",
  items: [
    {
      title: "Past Lives",
      byline: "Celine Song",
      type: "film",
      year: 2023,
      genre: "romance",
      mood: "melancolía",
      status: "completed",
      reaction: "obsessed",
      palette: ["#c9793f", "#2b3a55"],
    },
    {
      title: "SOS",
      byline: "SZA",
      type: "album",
      year: 2022,
      genre: "r&b",
      mood: "moody",
      status: "completed",
      reaction: "liked",
      palette: ["#3f6f9a", "#d9c7a3"],
    },
    {
      title: "Severance",
      byline: "Dan Erickson",
      type: "series",
      year: 2025,
      genre: "thriller",
      mood: "inquietud",
      status: "completed",
      palette: ["#2f6b5e", "#0f1c2e"],
    },
    {
      title: "La sociedad de la nieve",
      byline: "J. A. Bayona",
      type: "film",
      year: 2023,
      genre: "drama",
      mood: "frío",
      status: "on-my-radar",
      palette: ["#b8c4cc", "#34404a"],
    },
    {
      title: "Hit Me Hard and Soft",
      byline: "Billie Eilish",
      type: "album",
      year: 2027,
      genre: "alt-pop",
      mood: "dreamy",
      status: "on-my-radar",
      releaseDate: "2027-10-16T00:00:00.000Z",
      palette: ["#1f4f8f", "#0b1830"],
    },
  ],
};

/** A second collection only used to verify F1.4: different data → a visibly different pattern. */
export const ALT_BACKLOG: CardBacklog = {
  name: "recap de agosto",
  username: "sofi",
  items: [
    {
      title: "Challengers",
      byline: "Luca Guadagnino",
      type: "film",
      year: 2024,
      genre: "drama",
      mood: "tensión",
      status: "completed",
      reaction: "liked",
      palette: ["#5f8f3a", "#e8e2d0"],
    },
    {
      title: "GNX",
      byline: "Kendrick Lamar",
      type: "album",
      year: 2024,
      genre: "hip-hop",
      mood: "duro",
      status: "completed",
      reaction: "obsessed",
      palette: ["#7a3b2e", "#101010"],
    },
    {
      title: "The Bear",
      byline: "Christopher Storer",
      type: "series",
      year: 2026,
      genre: "drama",
      mood: "estrés",
      status: "on-my-radar",
      palette: ["#2a4d7a", "#c9b27a"],
    },
  ],
};

import type { DoubleFeatureData } from "../types";

/**
 * Canonical F1 × Rosie example from the reference (FRAME A). Used for the
 * card-lab preview and as the shape the F3.5.5 agent fills with real data.
 */
export const SAMPLE_DOUBLE_FEATURE: DoubleFeatureData = {
  seed: {
    title: "F1",
    type: "film",
    year: 2024,
    meta: "2H 46M",
  },
  reco: {
    title: "Rosie",
    type: "album",
    creator: "Rosé",
    meta: "12 TRK",
    duration: "42 MIN",
    tracklist: [
      "number one girl",
      "3am",
      "two years",
      "toxic till the end",
      "apt.",
      "stay a little longer",
      "call it the end",
      "gameboy",
      "messy",
    ],
  },
  palette: ["#C7462F", "#E8B23A", "#3A5A9B", "#7A2F5A", "#241C1A"],
  narrative: {
    hookEyebrow: "viste F1 hasta la última vuelta · ★★★★★",
    hookTitle: "Así que fuimos a buscar quién le puso voz a esa última vuelta.",
    resultEyebrow: "y dimos con tu próxima obsesión",
    closer: "No la vas a soltar — lo sabemos.",
  },
  username: "eric",
  edition: 14,
  linkKind: "factual",
};

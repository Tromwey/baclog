import "server-only";

/*
 * What the Mausoleum holds (design: proto/mausoleo/nichos.json + ouija.json).
 * SERVER-ONLY on purpose: a niche's title and text leave the server only once
 * it is open, and the ouija's messages only as an answer. The public copy
 * (public/party/mausoleo/nichos.json) carries just ids and thresholds.
 */

/**
 * `umbral` = seals delivered by EVERYONE together for the niche to open.
 * Order: I–III bottom row, IV–VI top row (left to right).
 */
export const LAB_NICHOS = [
  { id: "n1", umbral: 6, titulo: "Fecha", texto: "31 de octubre" },
  { id: "n2", umbral: 15, titulo: "Hora", texto: "6 PM" },
  { id: "n3", umbral: 30, titulo: "Lugar", texto: "Residencial Unio" },
  { id: "n4", umbral: 50, titulo: "Vestimenta", texto: "Disfrazados" },
  { id: "n5", umbral: 75, titulo: "Qué llevar", texto: "Brebajes y golosinas a tu gusto" },
  /*
   * The last niche holds an instant photo, not a text (founder, 2026-10-03): the host's tombstone with the
   * death date the labyrinth glitches out, and the question handwritten on the back. The Mausoleum draws it
   * in 3D from `foto`; `texto` is only the hint under the title.
   */
  {
    id: "n6",
    umbral: 100,
    titulo: "Pista",
    texto: "Una instantánea. Pareciera tener algo escrito detrás.",
    foto: { nombre: "Eric Briseño", fechas: "20/11/1994 – 31/10/2026", reverso: "¿¡Quién mató a Eric!?" },
  },
] as const;

/**
 * RSVP (founder, 2026-10-02): the ouija asks "¿Vendrás?" once the group has
 * revealed WHERE the party is — niche III (Lugar). Before that, nobody knows
 * what they'd be saying yes to.
 */
export const LAB_RSVP_UMBRAL = LAB_NICHOS.find((n) => n.id === "n3")!.umbral;

/**
 * Messages from beyond. `para` = the names or nicknames that trigger a message
 * (case- and accent-insensitive; the first name is enough). Each time that
 * person asks, the next text of `textos` comes out. No match → `generico`.
 * The board spells letters (A–Z, Ñ), digits and spaces; it skips the rest.
 * A nickname is NOT an identity — anyone can type any name — so nothing
 * private goes here.
 */
export const LAB_OUIJA: { mensajes: { para: string[]; textos: string[] }[]; generico: string[] } = {
  mensajes: [{ para: ["prueba"], textos: ["Te estábamos esperando", "No vuelvas solo"] }],
  generico: ["No te conocemos", "Nadie aquí preguntó por ti", "Vuelve otra noche"],
};

/** Lowercase, no accents (ñ kept), no punctuation, single spaces — the design's `normalNombre`. */
export const normalNombre = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/ñ/g, "\u0001")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\u0001/g, "ñ")
    .replace(/[^a-zñ0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

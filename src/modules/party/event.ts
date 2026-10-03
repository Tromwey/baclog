/**
 * The invitation hosted at /party (design: Claude Design project 3cd00900…,
 * "Invitacion Cementerio Iso.dc.html"). One event, hard-coded — these were
 * the design's editable props. `dateISO` has no offset on purpose (as in the
 * design): it reads as the guest's local time, which is the party's local
 * time for everyone invited.
 */
export const PARTY_EVENT = {
  slug: "costume-party-2026",
  title: "Costume Party",
  host: "Eric B",
  dateISO: "2026-10-31T18:00:00",
  venue: "Unio Residencial",
  address: "",
  /**
   * Teaser mode: the gate is chained and reads "MUY PRONTO"; tapping only
   * rattles the chains. `/party?abrir` bypasses it (for the host's own tests —
   * not a secret, just a door ajar). Set false to open the party.
   */
  locked: true,
} as const;

/**
 * The 3D landing at /party (design: Claude Design project 383601c9…, "Fase 2 -
 * Texturas y deco"). The gate stays chained ("Muy pronto" + countdown) until
 * `opensISO` — no offset on purpose: 00:00 of Saturday Oct 3 in the visitor's
 * local time — and then opens on its own ("Entra si te atreves").
 */
export const PARTY_LANDING = {
  opensISO: "2026-10-03T00:00:00",
  /** Where walking through the open gate leads: the labyrinth (design "Fase 3d - Laberinto cementerio"). */
  gamesUrl: "/party/laberinto",
  /** Where the labyrinth's door leads: the Mausoleum (design "Fase 3e - Mausoleo v2", public/party/mausoleo). */
  mausoleoUrl: "/party/mausoleo" as string | null,
  /**
   * Migration 0038 (`party_lab_*`) switch. false = the labyrinth keeps the design's localStorage mock
   * (seals live on the device only); true = the real seal server at /api/party/lab. Flip it only AFTER
   * the migration is applied — without the tables no minigame can start.
   */
  labServerLive: true as boolean,
} as const;

/**
 * What the crypt reveals, in order, as the party collects sacrifices (people
 * going, counted party-wide — see countSacrifices). `at` = sacrifices needed.
 */
export const CRYPT_REVEALS = [
  { key: "host", label: "El anfitrión", at: 1 },
  { key: "place", label: "Dónde", at: 2 },
  { key: "theme", label: "Vestimenta", at: 3 },
  { key: "bring", label: "Qué llevar", at: 4 },
  { key: "date", label: "Cuándo", at: 5 },
] as const;

export const PARTY_DIETS = [
  "Vegetariano",
  "Vegano",
  "Sin gluten",
  "Sin lácteos",
  "Alergia a frutos secos",
] as const;

export const PARTY_DRINKS = [
  "Vino tinto",
  "Cerveza",
  "Cócteles",
  "Destilados",
  "Sin alcohol",
] as const;

/** Case- and accent-insensitive key for the "someone already picked this costume" check. */
export function costumeKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

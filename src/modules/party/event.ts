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
} as const;

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

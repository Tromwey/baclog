/**
 * F3.6 — structured "why" feedback tag vocab on a cross-media-sourced item's
 * reaction. Plain module (NOT "use server") — a "use server" file may only
 * export async functions, so these constants live here and are imported by
 * both the server action (crossmedia-feedback-actions.ts) and the client UI
 * (item-row.tsx, item-status-controls.tsx) that render the chips.
 */
export const NEGATIVE_REASONS = [
  "link_didnt_make_sense",
  "not_my_vibe",
  "already_knew_it",
  "not_into_medium",
] as const;

export const POSITIVE_REASONS = [
  "link_was_great",
  "nailed_my_vibe",
  "real_discovery",
  "exactly_what_i_wanted",
] as const;

export const ALL_REASONS = [...NEGATIVE_REASONS, ...POSITIVE_REASONS] as const;

export const REASON_LABEL: Record<string, string> = {
  link_didnt_make_sense: "El vínculo no tenía sentido",
  not_my_vibe: "No es mi vibe",
  already_knew_it: "Ya lo conocía",
  not_into_medium: "El medio no me interesa",
  link_was_great: "El vínculo fue genial",
  nailed_my_vibe: "Acertó mi vibe",
  real_discovery: "Es un descubrimiento real",
  exactly_what_i_wanted: "Justo lo que buscaba",
};

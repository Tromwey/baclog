/**
 * An aviso of ONE sentence carries no final period (voz, 2026-10-03); one of
 * two or more keeps its punctuation (an inner ". ", "? " or "! " marks it).
 * Applied in ONE place — `useToast().show` — so every toast is normalized,
 * whether the text is a literal or the server's wording (the same message is
 * an inline error elsewhere, which DOES keep its period).
 *
 * Plain module (no "use client"): safe to import from anywhere.
 */
export const toastText = (s: string) => (/[.?!]\s/.test(s) ? s : s.replace(/\.$/, ""));

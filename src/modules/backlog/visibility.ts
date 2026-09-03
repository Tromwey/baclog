import type { BacklogVisibility } from "@/app/actions/backlog-actions";

/**
 * F3.10.1 — the three visibility states as a PLAIN module (no "use client"),
 * so a server component can derive a backlog's state from its two columns:
 * a client module's exports become client references on the server, and
 * calling one there throws at runtime (Revamp UI, 2026-09-03).
 */
export const VISIBILITY_STATES: { id: BacklogVisibility; label: string }[] = [
  { id: "private", label: "Privado" },
  { id: "public", label: "Público" },
  { id: "featured", label: "Perfil" },
];

/** `featured` is DERIVED (is_public AND show_on_profile), never persisted. */
export function visibilityOf(b: {
  isPublic: boolean;
  showOnProfile: boolean;
}): BacklogVisibility {
  if (!b.isPublic) return "private";
  return b.showOnProfile ? "featured" : "public";
}

/**
 * F3.10.1 — the three visibility states as a PLAIN module (no "use client",
 * no "server-only"), so a server component can derive a backlog's state from
 * its two columns: a client module's exports become client references on the
 * server, and calling one there throws at runtime (Revamp UI, 2026-09-03).
 *
 * The state → columns table lives HERE (not in the server action) so the
 * module layer (`collections.ts`) and the API handlers can write it without
 * importing a "use server" file; `backlog-actions.ts` re-imports it.
 */

/** The three states of F3.10.1, and how they land on the two boolean axes. */
export const VISIBILITY = {
  private: { isPublic: false, showOnProfile: false },
  public: { isPublic: true, showOnProfile: false },
  featured: { isPublic: true, showOnProfile: true },
} as const;

export type BacklogVisibility = keyof typeof VISIBILITY;

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

/**
 * The API v1 wire vocabulary (ios/API.md §3: `private` · `link` · `profile`)
 * and its DB twin. `link` = public by direct URL but off the profile.
 */
export type WireVisibility = "private" | "link" | "profile";

const FROM_WIRE: Record<WireVisibility, BacklogVisibility> = {
  private: "private",
  link: "public",
  profile: "featured",
};

export function visibilityFromWire(v: WireVisibility): BacklogVisibility {
  return FROM_WIRE[v];
}

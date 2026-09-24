import type { Person } from "../schemas";

/**
 * `Person` LITE (§3) — the card shape for lists (people search, suggestions,
 * followers, "gente que sigues"): identity + counts, with the profile-only
 * blocks (stats, obsessions, common, collections) EMPTY. `GET /people/{handle}`
 * fills those. Input is already public-gated by the query that produced it
 * (`publicAuthor` / `public.ts`) — this module never re-checks, so never feed
 * it a row that didn't come through one of those gates.
 */

export interface PersonLiteInput {
  username: string;
  name: string | null;
  avatarUrl: string | null;
  /** ADN hexes for the orb (dark → light); missing = no obsession yet. */
  avatarHexes?: string[] | null;
  isFounder?: boolean;
  followerCount?: number;
  followingCount?: number;
  /** Whether the CALLER follows them. */
  following?: boolean;
  /** Discovery line, suggestions only. */
  why?: string | null;
}

export function toPersonLite(row: PersonLiteInput): Person {
  return {
    handle: row.username,
    name: row.name ?? "",
    avatarUrl: row.avatarUrl,
    hexes: row.avatarHexes ?? [],
    featuredTitleId: null,
    isFounder: row.isFounder ?? false,
    followers: row.followerCount ?? 0,
    followingCount: row.followingCount ?? 0,
    stats: { obsessed: 0, liked: 0, completed: 0, reviews: 0 },
    obsessions: [],
    common: [],
    collections: [],
    isFollowing: row.following ?? false,
    why: row.why ?? null,
  };
}

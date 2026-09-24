import "server-only";
import { toPersonLite } from "@/app/api/v1/_lib/wire";
import type { Person } from "@/app/api/v1/_lib/schemas";
import { getPeoplePage } from "@/modules/social/queries";

/**
 * `GET /me/following` · `GET /me/followers` — the viewer's OWN lists
 * (F3.10: counts are public, lists are private; getPeoplePage never runs
 * for anyone but the bearer user). A cursor that doesn't decode simply
 * serves page 1 (decodeCursor → null), never an error.
 *
 * A followed account that went private keeps its row (it's the viewer's own
 * edge — hiding it would make the follow unremovable, AGENTS.md) but the
 * module already stripped its photo, colours and counts. The wire has no
 * `isPrivate` flag (PersonSchema is "public profiles only"), so such a row
 * travels as a plain card with `avatarUrl: null`, empty hexes and zero
 * counts — reported as a contract gap, not papered over here.
 */
export async function buildPeoplePage(
  viewerId: string,
  mode: "following" | "followers",
  cursor: string | null,
): Promise<{ items: Person[]; nextCursor: string | null; privateCount: number }> {
  const page = await getPeoplePage(viewerId, mode, cursor);
  return {
    items: page.people.map((p) =>
      toPersonLite({
        username: p.username,
        name: p.name,
        avatarUrl: p.avatarUrl,
        avatarHexes: p.isPrivate ? [] : p.avatarHexes,
        isFounder: p.isFounder,
        following: p.following,
      }),
    ),
    nextCursor: page.nextCursor,
    privateCount: page.privateCount,
  };
}

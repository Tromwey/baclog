import "server-only";
import { toPersonLite } from "@/app/api/v1/_lib/wire";
import type { Person } from "@/app/api/v1/_lib/schemas";
import { getPeoplePage } from "@/modules/social/queries";

/**
 * `GET /me/following` · `GET /me/followers` — the viewer's OWN lists
 * (F3.10: counts are public, lists are private; getPeoplePage never runs
 * for anyone but the bearer user). The handler validates the cursor
 * (`readCursor`): a corrupt one is a 400, never a silent page 1.
 *
 * A followed account that went private keeps its row (it's the viewer's own
 * edge — hiding it would make the follow unremovable, AGENTS.md); the
 * module already stripped its photo, colours and counts, and the card says
 * `isPrivate: true` so the app can dim it — the ONE place that flag exists
 * on the wire (PersonSchema).
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
        isPrivate: p.isPrivate,
      }),
    ),
    nextCursor: page.nextCursor,
    privateCount: page.privateCount,
  };
}

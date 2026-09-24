import { withApi } from "@/authz/api";
import { json } from "@/app/api/v1/_lib/http";
import { toPersonLite } from "@/app/api/v1/_lib/wire";
import { plural } from "@/lib/plural";
import { getFollowSuggestions } from "@/modules/social/queries";
import type { SuggestedProfile } from "@/modules/social/types";

/**
 * GET /api/v1/people/suggestions → { items: [Person] } — the same eight
 * public profiles "tu gente" (feed/gente) offers: not the viewer, not yet
 * followed, most recently active first. `why` is the web row's meta line
 * minus "fundador" (the card already carries `isFounder`).
 */
function whyOf(s: SuggestedProfile): string {
  return [
    `${s.backlogCount} ${plural(s.backlogCount, "colección", "colecciones")}`,
    s.lastActive
      ? `actividad ${s.lastActive}`
      : `${s.followerCount} ${plural(s.followerCount, "seguidor", "seguidores")}`,
  ].join(" · ");
}

export const GET = withApi(async (_req, { user }) => {
  const suggestions = await getFollowSuggestions(user.id, 8);
  return json({
    items: suggestions.map((s) =>
      toPersonLite({
        username: s.username,
        name: s.name,
        avatarUrl: s.avatarUrl,
        avatarHexes: s.avatarHexes,
        isFounder: s.isFounder,
        followerCount: s.followerCount,
        following: false,
        why: whyOf(s),
      }),
    ),
  });
});

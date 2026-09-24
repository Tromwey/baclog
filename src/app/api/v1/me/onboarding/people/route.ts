import { withApi } from "@/authz/api";
import { json } from "@/app/api/v1/_lib/http";
import { toPersonLite } from "@/app/api/v1/_lib/wire";
import { getOwnPicks, getPeopleForPicks } from "@/modules/social/people";

/**
 * GET /api/v1/me/onboarding/people → { items: [Person] } — 32b "tu gente":
 * public profiles that obsess over what the viewer picked, topped up with
 * the recently-active pool. Same gate as the web page: without picks there
 * is nobody to match against, so the list is empty (the app goes back to
 * the picks step, as the web redirects).
 */
export const GET = withApi(async (_req, { user }) => {
  const picks = await getOwnPicks(user.id);
  if (picks.length === 0) return json({ items: [] });
  const people = await getPeopleForPicks(user.id, 8);
  return json({
    items: people.map((p) =>
      toPersonLite({
        username: p.username,
        name: p.name,
        avatarUrl: p.avatarUrl,
        avatarHexes: p.avatarHexes,
        following: p.following,
        why: p.sharedTitle ? `Le obsesiona ${p.sharedTitle}` : null,
      }),
    ),
  });
});

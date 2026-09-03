import { requireUser } from "@/auth";
import { getUserPalette } from "@/modules/backlog/queries";
import { getLibraryUpcoming } from "@/modules/backlog/library";
import {
  getObsessions,
  getProfileCards,
  getReactionCounts,
} from "@/modules/backlog/profile-stats";
import { getFollowCounts } from "@/modules/social/queries";
import { getRenderInstant } from "@/modules/catalog/release";
import { PerfilScreen } from "./perfil-screen";

/**
 * Screen 09 (Revamp UI, 2026-09-03) — your profile: identity over your ADN
 * glow, the three reaction pills, followers/following, what you can't wait
 * for, your current obsessions and your cards. Every read is scoped to the
 * session user inside its query. All server component.
 */
export default async function PerfilPage() {
  const user = await requireUser();
  const now = await getRenderInstant();
  const [palette, counts, followCounts, upcoming, obsessions, cards] =
    await Promise.all([
      getUserPalette(user.id),
      getReactionCounts(user.id),
      getFollowCounts(user.id),
      getLibraryUpcoming(user.id, now),
      getObsessions(user.id),
      getProfileCards(user.id, now),
    ]);

  return (
    <PerfilScreen
      name={user.name ?? ""}
      username={user.username}
      avatarUrl={user.image}
      isPublic={user.isPublic}
      palette={palette}
      counts={counts}
      followCounts={followCounts}
      upcoming={upcoming}
      obsessions={obsessions}
      cards={cards}
      now={now}
    />
  );
}

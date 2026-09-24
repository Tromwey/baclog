import { requireUser } from "@/auth";
import { getUserPalette } from "@/modules/backlog/queries";
import { getLibraryUpcoming } from "@/modules/backlog/library";
import {
  getObsessions,
  getProfileCards,
  getReactionCounts,
} from "@/modules/backlog/profile-stats";
import { getShelvesForUser } from "@/modules/backlog/shelves";
import { getFollowCounts } from "@/modules/social/queries";
import { getRenderInstant } from "@/modules/catalog/release";
import { getLatestRecapKey } from "../recap/recap-data";
import { PerfilScreen } from "./perfil-screen";

/**
 * 20c Perfil propio (Kura, flujo 09) — your profile: the header tinted by
 * what obsesses you, the seal or photo, followers · following, the state
 * pills, the recap chip; then "me obsesiona", what you can't wait for and
 * "tus colecciones". Every read is scoped to the session user inside its
 * query. All server component.
 */
export default async function PerfilPage() {
  const user = await requireUser();
  const now = await getRenderInstant();
  const [palette, counts, followCounts, upcoming, obsessions, cards, shelves, recapKey] =
    await Promise.all([
      getUserPalette(user.id),
      getReactionCounts(user.id),
      getFollowCounts(user.id),
      getLibraryUpcoming(user.id, now),
      getObsessions(user.id),
      getProfileCards(user.id, now),
      getShelvesForUser(user.id),
      getLatestRecapKey(user.id),
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
      shelves={shelves}
      recapKey={recapKey}
      now={now}
    />
  );
}

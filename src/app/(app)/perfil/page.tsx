import { requireUser } from "@/auth";
import {
  getBacklogsForUser,
  getUserPalette,
  getUserStats,
} from "@/modules/backlog/queries";
import { getFollowCounts } from "@/modules/social/queries";
import { PerfilScreen } from "./perfil-screen";

/**
 * F3.10 (design 2a) — Perfil is your public profile now: identity, stats,
 * tu gente (follows) and your backlog shelves. The settings list that used to
 * live here sits behind the header's ajustes chip (/settings). All server
 * component — nothing here needs client state.
 */
export default async function PerfilPage() {
  const user = await requireUser();
  const [stats, palette, followCounts, backlogs] = await Promise.all([
    getUserStats(user.id),
    getUserPalette(user.id),
    getFollowCounts(user.id),
    getBacklogsForUser(user.id),
  ]);

  return (
    <PerfilScreen
      name={user.name ?? ""}
      username={user.username}
      avatarUrl={user.image}
      isPublic={user.isPublic}
      stats={stats}
      palette={palette}
      followCounts={followCounts}
      backlogs={backlogs}
    />
  );
}

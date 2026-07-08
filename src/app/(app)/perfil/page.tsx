import { requireUser } from "@/auth";
import { getUserPalette, getUserStats } from "@/modules/backlog/queries";
import { PerfilScreen } from "./perfil-screen";

/**
 * F-M3.5 — Perfil, the third nav destination. Replaces the old Ajustes tab:
 * identity (ADN orb, not a photo — auth is OTP, no avatars), stats, a thin
 * settings list that reuses /settings for editing, and sign out. All server
 * component — nothing here needs client state.
 */
export default async function PerfilPage() {
  const user = await requireUser();
  const [stats, palette] = await Promise.all([
    getUserStats(user.id),
    getUserPalette(user.id),
  ]);

  return (
    <PerfilScreen
      name={user.name ?? ""}
      username={user.username}
      stats={stats}
      palette={palette}
    />
  );
}

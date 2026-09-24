import { requireUser } from "@/auth";
import { getUserPalette } from "@/modules/backlog/queries";
import { getObsessions } from "@/modules/backlog/profile-stats";
import { tintSurfaceVertical } from "@/components/kura/tint";
import { profileHexes } from "@/app/(app)/perfil/profile-hexes";
import { EditProfile } from "./edit-profile";

/**
 * 20f Editar perfil (Kura, flujo 09) — from Ajustes' "Editar perfil ›": the
 * header tinted like your profile, Cancelar (×) and Guardar on the 64 row,
 * the photo at 104 with "Cambiar foto", then one `--s1` group: Nombre and
 * @usuario.
 *
 * Omitted from the mock, because the product has no data for them: the
 * "obsesión destacada" picker (no column — the newest obsession tints) and
 * "Mostrar En común contigo" (always on). "Perfil privado" lives in Ajustes ›
 * privacidad, where it already was.
 */
export default async function EditProfilePage() {
  const user = await requireUser();
  const [palette, obsessions] = await Promise.all([
    getUserPalette(user.id),
    getObsessions(user.id, 12),
  ]);
  const hexes = profileHexes(obsessions, palette);

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md bg-bg pb-dock-clearance text-text">
      <EditProfile
        tint={tintSurfaceVertical(hexes)}
        hexes={hexes}
        initialName={user.name ?? ""}
        initialUsername={user.username}
        initialAvatarUrl={user.image}
      />
    </main>
  );
}

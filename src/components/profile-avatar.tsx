import { Seal } from "@/components/kura/components";
import { sealHexesOf } from "@/components/adn-avatar";

/**
 * The profile-sized identity disc (/perfil, Ajustes, Editar perfil). Kura
 * (2026-09-24): the photo when there is one (F3.11), else the SEAL — two
 * lowercase initials in Newsreader italic over the dark tone of the palette
 * that tints the header, inverted and pulled 72 % toward --bg (§marca ·
 * sello). No depth shadow, no highlight: the seal is flat like every other
 * Kura surface. Server-safe.
 */
export function ProfileAvatar({
  src,
  hexes,
  name,
  size = 128,
  className = "",
}: {
  src: string | null;
  /** The palette that tints the owner's header (light tone first). */
  hexes: readonly string[];
  /** Display name or handle — the seal's two initials. */
  name: string;
  size?: number;
  className?: string;
}) {
  return (
    <Seal name={name || "·"} hexes={sealHexesOf(hexes)} src={src} size={size} className={className} />
  );
}

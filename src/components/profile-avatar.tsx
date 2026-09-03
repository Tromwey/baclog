import { AdnAvatar } from "@/components/adn-avatar";
import { legibleAdnPair } from "@/modules/reviews/format";

/**
 * The profile-sized identity disc (/perfil and /u/[username]), redrawn for the
 * Revamp UI (2026-09-03): the mock's 72px ADN orb — the owner's two legible
 * palette stops, their initial in mono 24 punched out in the page background
 * — with the mock's depth shadow and 1px inner highlight; their photo on top
 * when they have one (F3.11), the orb staying underneath as the loading fill.
 * Server component; size travels in `className` when a caller needs another.
 */
export function ProfileAvatar({
  src,
  palette,
  initial,
  className = "",
}: {
  src: string | null;
  palette: string[];
  /** First grapheme of the handle/name, uppercased. */
  initial: string;
  className?: string;
}) {
  return (
    <AdnAvatar
      hexes={legibleAdnPair(palette)}
      initial={initial}
      src={src}
      className={`h-[72px] w-[72px] text-[24px] shadow-[0_18px_40px_-14px_rgba(0,0,0,.8),inset_0_1px_0_rgba(255,255,255,.3)] ${className}`}
    />
  );
}

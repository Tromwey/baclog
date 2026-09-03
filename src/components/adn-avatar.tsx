import { avatarGradient } from "@/modules/reviews/format";

/**
 * F3.10 — the ADN orb at any size: two dominant colors of someone's library
 * over surface-2, optionally with their initial punched out in the page
 * background color (the F3.9 avatar recipe, generalized). Server-safe — no
 * hooks — so suggestion cards and list rows can stay server components.
 *
 * F3.11 — with a `src` the same disc shows their profile photo instead; the
 * orb stays underneath as the fill while the image loads (and if it never
 * does), so a card never shows a hole where a face should be.
 *
 * Size, typography and the initial's presence travel via className/initial:
 * the feed card uses 24px + initial, suggestion cards 34-38px plain orbs.
 */
export function AdnAvatar({
  hexes,
  initial,
  src,
  className = "",
}: {
  hexes: readonly [string, string];
  initial?: string;
  src?: string | null;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`flex flex-none items-center justify-center overflow-hidden rounded-full font-mono text-bg ${className}`}
      style={{ background: avatarGradient(hexes) }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- our own route, fixed square, no optimizer needed
        <img
          src={src}
          alt=""
          draggable={false}
          className="h-full w-full object-cover"
        />
      ) : (
        (initial ?? "")
      )}
    </span>
  );
}

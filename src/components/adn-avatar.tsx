import { sealColors, sealInitials } from "@/components/kura/tint";
import { FALLBACK_ADN } from "@/modules/reviews/format";

/**
 * The small identity disc of every row, chip and card (feed author, people
 * lists, reviews, suggestions). Kura (2026-09-24): it is the SEAL now, not the
 * Revamp's two-lobe ADN orb — the system's avatar without a photo is "dos
 * iniciales en minúscula, Newsreader itálica 500 al 42 % del diámetro, sobre
 * el tono oscuro de su paleta invertido y mezclado 72 % hacia --bg"
 * (`sealColors`). A radial blob of colour behind a face was a glow by another
 * name; the seal is flat.
 *
 * The name keeps being `AdnAvatar` so every caller (feed, descubrir, ficha,
 * review cards) turns into a seal at once, with the same props: `hexes` is
 * still the owner's ADN pair — the lima/mauve FALLBACK pair is dropped first
 * (it is not a Kura colour: "sin portada no hay color", so a paletteless
 * person gets the plain `--s2` seal).
 *
 * Server-safe — no hooks. The initials are an SVG `<text>` on a 100-unit box,
 * so they sit at 42 % of whatever size the caller's className gives the disc
 * (h-10, h-[22px], h-[52px]…) without the caller knowing the pixel size.
 *
 * With a `src` the disc shows the photo (F3.11); the seal stays underneath as
 * the loading fill.
 */
export function AdnAvatar({
  hexes,
  initial,
  name,
  src,
  className = "",
}: {
  hexes: readonly [string, string] | readonly string[];
  /** One grapheme (the old orb's initial). `name` wins when both are given. */
  initial?: string;
  /** Display name or handle — the seal takes two initials from it. */
  name?: string;
  src?: string | null;
  className?: string;
}) {
  const { bg, fg } = sealColors(sealHexesOf(hexes));
  const letters = name ? sealInitials(name) : (initial ?? "").toLowerCase();
  return (
    <span
      aria-hidden
      className={`relative flex flex-none items-center justify-center overflow-hidden rounded-full ${className}`}
      style={{ background: bg }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- our own route, fixed square, no optimizer needed
        <img src={src} alt="" draggable={false} className="h-full w-full object-cover" />
      ) : letters ? (
        <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden>
          <text
            x="49"
            y="52"
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="42"
            fill={fg}
            className="kura-seal"
          >
            {letters}
          </text>
        </svg>
      ) : null}
    </span>
  );
}

/**
 * The seal's palette from an ADN pair: the lima/mauve padding that
 * `legibleAdnPair` falls back to is not the person's colour, so it goes.
 * Plain function (this module has no "use client"), shared with the feed's
 * author chip and the profile seal.
 */
export function sealHexesOf(hexes: readonly string[]): string[] {
  const fallback = new Set(FALLBACK_ADN.map((h) => h.toLowerCase()));
  return hexes.filter((h) => h && !fallback.has(h.toLowerCase()));
}

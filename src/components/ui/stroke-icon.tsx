/**
 * A stroke glyph from `glyph-paths.ts` at a size (Revamp UI, 2026-09-03). The
 * mock draws its chrome — back, share, plus, gear, chevrons — as 24-grid
 * stroke paths with round caps at widths 2.2–2.6, not as an icon font. One
 * component so every chip in the app draws the same line.
 */
export function StrokeIcon({
  d,
  size = 16,
  strokeWidth = 2.4,
  className = "",
}: {
  d: string;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}

/** A filled glyph (flame, thumb, play) at a size. */
export function FillIcon({
  d,
  size = 12,
  className = "",
  style,
}: {
  d: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}

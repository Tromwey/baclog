import type { MediaType } from "@/modules/catalog/types";

/**
 * A cover at a named size — WIDTH is fixed, height follows the native aspect
 * (album 1:1, video 2:3): never cross-cropped, never a fake square for a
 * poster. One home for the rule the feed cards, and any list that shows a
 * small cover, used to spell inline. Server-safe (no hooks). Hotlinked from
 * the external CDN (ADR-007: never proxy) and lazy on purpose — a burst strip
 * can hold dozens of these, most of them off-screen.
 */
export type CoverThumbSize = "xs" | "sm" | "md" | "lg";

const SIZES: Record<
  CoverThumbSize,
  { w: string; album: string; video: string; radius: string }
> = {
  xs: { w: "w-7", album: "h-7", video: "h-[42px]", radius: "rounded-[5px]" },
  sm: { w: "w-8", album: "h-8", video: "h-12", radius: "rounded-md" },
  md: { w: "w-[52px]", album: "h-[52px]", video: "h-[78px]", radius: "rounded-[9px]" },
  lg: { w: "w-16", album: "h-16", video: "h-24", radius: "rounded-[10px]" },
};

export function CoverThumb({
  mediaType,
  posterUrl,
  size,
  className = "",
}: {
  mediaType: MediaType;
  posterUrl: string | null;
  size: CoverThumbSize;
  className?: string;
}) {
  const s = SIZES[size];
  const box = `${s.w} ${mediaType === "album" ? s.album : s.video} ${s.radius} flex-none ${className}`;
  if (posterUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- hotlinked external CDN (ADR-007: never proxy)
      <img
        src={posterUrl}
        alt=""
        loading="lazy"
        decoding="async"
        className={`${box} object-cover`}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`${box} flex items-center justify-center bg-surface-2 text-text-3`}
    >
      {mediaType === "album" ? "♫" : "▶"}
    </span>
  );
}

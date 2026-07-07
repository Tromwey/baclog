import { CARD_HEIGHT, CARD_WIDTH, type DoubleFeatureData } from "../types";
import { DoubleFeatureCard } from "./double-feature-card";

/**
 * Scales the native 1080×1920 Double Feature card down to a target width for
 * in-app display / thumbnails (matching the reference's transform:scale
 * approach). The inner <DoubleFeatureCard> is still the exact exportable
 * artifact — the F3.5.5 agent rasterizes that node, not this wrapper.
 */
export function DoubleFeaturePreview({
  data,
  width = 360,
  className,
}: {
  data: DoubleFeatureData;
  /** Rendered width in px; height follows the 9:16 ratio. */
  width?: number;
  className?: string;
}) {
  const scale = width / CARD_WIDTH;
  return (
    <div
      className={className}
      style={{
        width,
        height: CARD_HEIGHT * scale,
        borderRadius: 20,
        overflow: "hidden",
        boxShadow: "0 24px 60px rgba(0,0,0,.5)",
      }}
    >
      <div
        style={{
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        <DoubleFeatureCard data={data} />
      </div>
    </div>
  );
}

import type { CSSProperties } from "react";
import { rgba } from "@/lib/color";

/**
 * A cover without art: the palette recipe — a radial highlight over a 160°
 * two-hex gradient — so a strip, a fan or a row never shows a hole. With no
 * palette either, two neutral surface tones.
 *
 * Plain module (server- and client-safe): the fan, the masonry, `Cover`, the
 * cover flight and the OG cards all paint from it.
 */
export function posterFallbackStyle(paletteHex: readonly string[] | null | undefined): CSSProperties {
  const a = paletteHex?.[0] ?? "#2a2a30";
  const b = paletteHex?.[1] ?? "#141417";
  return {
    background: `radial-gradient(90% 70% at 30% 20%, ${rgba(a, 0.55)} 0%, ${rgba(a, 0)} 70%), linear-gradient(160deg, ${a} 0%, ${b} 100%)`,
  };
}

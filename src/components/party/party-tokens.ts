import type { CSSProperties } from "react";

/**
 * The /party world's palette (fiesta-app-v2 · `--p-*`): the Halloween
 * invitation lives OUTSIDE Kura's system on purpose (its own page, its own
 * ink), and the "Arma la playlist" card plus the bridge into /f/{token} speak
 * it. Defined ONCE here as CSS custom properties; the card and the bridge
 * overlay spread `PARTY_TOKENS` on their root and read `var(--p-…)`.
 */
export const PARTY_TOKENS = {
  "--p-bg": "#0c0e11",
  "--p-surface": "#171b20",
  "--p-surface-2": "#20262d",
  "--p-bone": "#ebe4d2",
  "--p-bone-2": "#aaa291",
  "--p-moss": "#7f8f6a",
} as CSSProperties;

/** `/f/{token}?from=party`: the /party card's "Abrir la playlist" (the landing plays the bridge in). */
export const BRIDGE_QUERY = "from";
export const BRIDGE_VALUE = "party";

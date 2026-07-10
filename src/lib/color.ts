/**
 * Shared hex-color helpers + the deterministic aura seed. Plain, dependency-
 * free module — safe on the server AND in client components (AuraField,
 * ThemeColorSync). NOTE: modules/cards/** keeps its own copies on purpose
 * (the export pipeline is self-contained); don't fold those in here.
 */

export interface RGB {
  r: number;
  g: number;
  b: number;
}

/** Tolerant `#rgb` / `#rrggbb` parser (leading `#` optional) — null otherwise. */
export function parseHex(hex: string): RGB | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.replace(/./g, (c) => c + c);
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/**
 * hex → `rgba(r, g, b, a)`. Malformed input degrades to the app bg at alpha 0
 * ("rgba(11, 11, 13, 0)") — an invisible stop, NEVER "rgba(NaN, …)" (one NaN
 * stop invalidates an entire comma-joined gradient list).
 */
export function rgba(hex: string, a: number): string {
  const c = parseHex(hex);
  return c ? `rgba(${c.r}, ${c.g}, ${c.b}, ${a})` : "rgba(11, 11, 13, 0)";
}

/**
 * Blend `hex` toward `target` by `amount` (0 = unchanged, 1 = fully target),
 * returned as `#rrggbb`. Malformed input collapses to the target itself.
 */
export function mixToward(hex: string, target: RGB, amount: number): string {
  const c = parseHex(hex) ?? target;
  const mix = (from: number, to: number) => Math.round(from + (to - from) * amount);
  const ch = (v: number) => v.toString(16).padStart(2, "0");
  return `#${ch(mix(c.r, target.r))}${ch(mix(c.g, target.g))}${ch(mix(c.b, target.b))}`;
}

/**
 * Deterministic aura seed from an entity id (backlog, catalog item…) — same
 * id ⇒ same AuraField jitter on every render, server and client.
 */
export function auraSeed(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * The exportable cards' fonts, as REAL document fonts.
 *
 * The card renderers (src/modules/cards/render) draw on <canvas> by family
 * name — "Space Mono", "Bricolage Grotesque", "Instrument Serif", "Hanken
 * Grotesk", "Newsreader", "Red Hat Mono" — and next/font's hashed family names
 * are unusable there. The families used to come from a `<link
 * rel="stylesheet">` in the root layout: a render-blocking third-party request
 * on EVERY page, for something only three surfaces draw (the card exporter,
 * the ficha's Double Feature share, /prototype).
 *
 * Now the exporter asks for it. `ensureCardFonts()` injects the stylesheet
 * once and resolves when it has loaded (or failed — the card then falls back
 * like it did offline). AWAIT IT BEFORE `document.fonts.load/check`: with no
 * @font-face for a family yet, `document.fonts.check()` answers TRUE ("nothing
 * to load"), and the card would be rasterized in the fallback face.
 *
 * Keep the families in sync with CARD_FONTS (src/modules/cards/render/fonts.ts).
 * Plain module: browser-only by guard.
 */

const HREF =
  "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Instrument+Serif:ital@0;1&family=Hanken+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&family=Newsreader:ital,opsz,wght@0,6..72,400;1,6..72,400;1,6..72,500&family=Red+Hat+Mono:wght@400&display=swap";

let pending: Promise<void> | null = null;

export function ensureCardFonts(): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  if (pending) return pending;
  pending = new Promise<void>((resolve) => {
    for (const origin of ["https://fonts.googleapis.com", "https://fonts.gstatic.com"]) {
      const pre = document.createElement("link");
      pre.rel = "preconnect";
      pre.href = origin;
      if (origin.includes("gstatic")) pre.crossOrigin = "anonymous";
      document.head.appendChild(pre);
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = HREF;
    link.onload = () => resolve();
    link.onerror = () => {
      // Offline or blocked: let the next exporter try again.
      link.remove();
      pending = null;
      resolve();
    };
    document.head.appendChild(link);
  });
  return pending;
}

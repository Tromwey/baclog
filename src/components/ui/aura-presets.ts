import type { FixedAuraLayer } from "./aura-field";

/**
 * Hand-authored aura layers (AuraField fixed mode). These are IDENTITY
 * gradients — lens branding, first-use, empty-shelf neutral, the public item
 * signature — not content ADN, so their colors are fixed by design (mock
 * #p4–#p8) rather than derived from a palette. Relocated verbatim from their
 * former inline call sites; tweak here, render via <AuraField layers={[…]}/>.
 */

export type LensAuraKey =
  | "obsesiones"
  | "en-progreso"
  | "completados"
  | "en-el-radar";

/** Per-lens fixed identity gradients (mock #p4–#p6; en-el-radar composed in
 * the same mold from --radar). Keys match /backlogs/lentes/[kind] slugs. */
export const LENS_AURAS: Record<LensAuraKey, FixedAuraLayer> = {
  obsesiones: {
    background:
      "radial-gradient(70% 80% at 16% 8%, #FF2D55 0%, rgba(255,45,85,0) 55%), radial-gradient(70% 80% at 86% 16%, #7A1B4A 0%, rgba(122,27,74,0) 58%), radial-gradient(90% 90% at 55% 96%, #C7462F 0%, rgba(199,70,47,0) 60%)",
    opacity: 0.95,
    animation: "drift",
    duration: "12s",
  },
  "en-progreso": {
    background:
      "radial-gradient(70% 80% at 16% 8%, #E8B23A 0%, rgba(232,178,58,0) 55%), radial-gradient(70% 80% at 86% 16%, #C7462F 0%, rgba(199,70,47,0) 58%), radial-gradient(90% 90% at 55% 96%, #7A8C55 0%, rgba(122,140,85,0) 60%)",
    opacity: 0.95,
    animation: "drift",
    duration: "12s",
  },
  completados: {
    // #p6 is the one lens with the dimmer glow + darker scrim (lime is loud)
    background:
      "radial-gradient(70% 80% at 16% 8%, #D8FF3E 0%, rgba(216,255,62,0) 52%), radial-gradient(70% 80% at 86% 16%, #2A6E5A 0%, rgba(42,110,90,0) 58%), radial-gradient(90% 90% at 55% 96%, #7A8C55 0%, rgba(122,140,85,0) 60%)",
    opacity: 0.9,
    animation: "drift",
    duration: "12s",
  },
  "en-el-radar": {
    // No mock for this lens — trio composed in the #p4/#p5 mold from the
    // radar blue (--radar #7AA2FF), its deep companion, and a muted slate.
    background:
      "radial-gradient(70% 80% at 16% 8%, #7AA2FF 0%, rgba(122,162,255,0) 55%), radial-gradient(70% 80% at 86% 16%, #3A5A9B 0%, rgba(58,90,155,0) 58%), radial-gradient(90% 90% at 55% 96%, #5A6E8C 0%, rgba(90,110,140,0) 60%)",
    opacity: 0.95,
    animation: "drift",
    duration: "12s",
  },
};

/** First-use screen (mock #p8): muted fixed-color aura — there's no content
 * ADN to drive one yet, and an AuraField palette fallback would aura lima,
 * which is exactly what the mock avoids here. */
// NOTE: the public item page (u/[username]/item/[id]) no longer uses a fixed
// preset — it auras from the cover-derived catalog palette via <ItemHeroAura>,
// identical to the in-app /item hero (the paletteHex is public-safe).
export const ONBOARDING_AURA: FixedAuraLayer = {
  background:
    "radial-gradient(46% 58% at 20% 8%, #C7462F 0%, rgba(199,70,47,0) 58%), radial-gradient(46% 58% at 82% 12%, #3A5A9B 0%, rgba(58,90,155,0) 58%), radial-gradient(50% 60% at 55% 40%, #9B4DCA 0%, rgba(155,77,202,0) 60%)",
  opacity: 0.4,
  animation: "drift",
  duration: "16s",
  inset: "-12%",
};

/** Empty shelf (mock #p7): the faint neutral glow a backlog gets before its
 * first item — no aura until there's content ADN (HANDOFF §5). */
export const EMPTY_SHELF_AURA: FixedAuraLayer = {
  background:
    "radial-gradient(80% 80% at 50% 0%, #26262C 0%, rgba(38,38,44,0) 62%)",
  opacity: 0.9,
  animation: "drift",
  duration: "12s",
};


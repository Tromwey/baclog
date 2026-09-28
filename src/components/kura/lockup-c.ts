/**
 * §marca · C "con kanji" — the proportions of 蔵 kura, in ONE place for the
 * three web renderers: the DOM `Wordmark variant="C"` (components.tsx), the
 * canvas cards (`drawLockup`, modules/cards/render/brand.ts) and the Satori
 * link previews (`OgLockup`, lib/og-cards.tsx). iOS mirrors these numbers in
 * `Wordmark` (DesignSystem/Typography.swift) — change both together.
 *
 * Every value is a multiple of the kura's font size `s`.
 *
 * Deviation from §marca, approved by the founder (2026-09-28): §marca draws
 * 蔵 at 2× and 700 with a 20/48 gap; in product it read as a kanji with a
 * caption. In-product and in images it's now 1.5×, ~600, gap scaled with it
 * (20/96 of the kanji = 15/48 of the kura), and 蔵's ink is centred on the
 * kura's optical centre instead of on the line box. The 2× stays only for
 * isolated brand pieces (press, merch) — no renderer draws it.
 */
export const LOCKUP_C = {
  /** 蔵's font size, × s. */
  kanji: 1.5,
  /** The gap between 蔵 and kura, × s (20/96 of the kanji). */
  gap: 15 / 48,
  /**
   * The kura's optical centre above its baseline, × s. Its ink runs from the
   * baseline to the k's ascender (0.714) with the body at the x-height
   * (0.448): 0.32 sits between the box's centre (0.357) and the body's
   * (0.224), leaning on the box — where the eye puts the word's middle.
   */
  center: 0.32,
  /**
   * How far 蔵's baseline drops below the kura's, × s, so its ink centre
   * (0.381 em in Noto Serif CJK and Hiragino Mincho alike) lands on
   * `center`: 0.381 × 1.5 − 0.32 ≈ 0.25.
   */
  drop: 0.25,
  /**
   * Images only: the kanji ships as Noto Serif CJK JP Regular (kanji-font.ts),
   * so its weight is a stroke in the same ink. 0.02 em of the kanji thickens
   * each stem by that much (Regular ≈ 0.058 em → ≈ 0.078, between Medium and
   * SemiBold ≈ 550–600). Web and iOS use the system Mincho's real 600 (W6).
   */
  stroke: 0.02,
} as const;

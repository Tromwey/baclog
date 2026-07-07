/**
 * Signature aura + grain backdrop (sistema-diseno §5, §6). Absolutely
 * positioned layers meant to sit behind a `relative` content wrapper. The
 * grain is the analog-artifact texture that separates "posteable" from AI
 * slop; it never encodes information. Glass and full-bleed color stay as
 * accents only — this is the one place the aura bleeds across a surface.
 */
export function AuraBackdrop({
  className = "",
  height = "40%",
}: {
  className?: string;
  /** How far the aura bleeds from the top (CSS length or %). */
  height?: string;
}) {
  return (
    <>
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-x-0 top-0 bl-aura ${className}`}
        style={{ height, opacity: 0.9 }}
      />
      <div aria-hidden className="bl-grain" />
    </>
  );
}

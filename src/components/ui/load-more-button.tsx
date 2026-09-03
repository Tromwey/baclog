/**
 * The keyset lists' "Ver más" (feed, siguiendo/seguidores, reseñas): one
 * recipe, so a spinner, a focus state or a label change ships to all of them
 * at once. `label` is what the button says when idle — a caller that keeps
 * its cursor after a failed load says so here ("No se pudo cargar ·
 * Reintentar") instead of letting a silent retap look like the end of the list.
 *
 * Two fills, one behavior: `block` is the full-width surface row of the
 * lists; `pill` is the centered glass pill of the feed v3, which has no
 * card surfaces for a block to sit on.
 */
const VARIANT = {
  block:
    "block w-full rounded-[14px] bg-surface-2 py-[13px] text-text-2",
  pill:
    "mx-auto block rounded-full bg-black/[0.28] px-[22px] py-3 text-text backdrop-blur-[18px] hover:bg-black/[0.4]",
} as const;

export function LoadMoreButton({
  onClick,
  loading,
  label = "Ver más",
  variant = "block",
  className = "",
}: {
  onClick: () => void;
  loading: boolean;
  label?: string;
  variant?: keyof typeof VARIANT;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={`${VARIANT[variant]} font-mono text-[10.5px] uppercase tracking-[0.1em] transition-[opacity,background-color] disabled:opacity-50 ${className}`}
    >
      {loading ? "Cargando…" : label}
    </button>
  );
}

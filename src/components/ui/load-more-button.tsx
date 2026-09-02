/**
 * The keyset lists' "Ver más" (feed, siguiendo/seguidores, reseñas): one
 * recipe, so a spinner, a focus state or a label change ships to all of them
 * at once. `label` is what the button says when idle — a caller that keeps
 * its cursor after a failed load says so here ("No se pudo cargar ·
 * Reintentar") instead of letting a silent retap look like the end of the list.
 */
export function LoadMoreButton({
  onClick,
  loading,
  label = "Ver más",
  className = "",
}: {
  onClick: () => void;
  loading: boolean;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={`block w-full rounded-[14px] bg-surface-2 py-[13px] font-mono text-[10.5px] uppercase tracking-[0.1em] text-text-2 transition-opacity disabled:opacity-50 ${className}`}
    >
      {loading ? "Cargando…" : label}
    </button>
  );
}

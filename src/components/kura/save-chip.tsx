import { BOOKMARK_PATH } from "@/components/glyph-paths";
import { plural } from "@/lib/plural";
import { CHIP_44, GLASS_BUTTON } from "./components";

/**
 * The one "guardar un título" affordance (Kura §patrones · guardar: "Guardar
 * abre siempre la hoja 'guardar en'… Guardado muestra el marcador lleno con el
 * número de colecciones"). Twin of iOS `SaveChip` (DesignSystem/Components/
 * Buttons.swift).
 *
 * - ONE icon: the bookmark, outlined until the title is in ≥ 1 collection,
 *   then filled. "+" is not "guardar" — it stays for "Nueva colección" /
 *   "Agregar títulos" to THIS collection (search-sheet, the collection body).
 * - ONE surface: the flat `--glass-bg` fill. It is content (the ficha's row, a
 *   card, a list row), never chrome over art — so never `CHIP_ART`.
 * - `pill`: 44 capsule with "Guardar" / "En N colecciones" (ficha 24a–d, the
 *   rec card 19a). `icon`: 44 round chip in a list row (19a tendencias, 19f
 *   resultados); once saved it drops its fill and reads as an indicator — the
 *   filled bookmark + the count in mono — on the same 44 hit area.
 */
export function SaveChip({
  saved,
  title,
  onClick,
  variant = "icon",
}: {
  /** How many of the viewer's collections hold the title. */
  saved: number;
  /** The work's name, for the accessible label in a list (the ficha omits it:
   *  the title is the page). */
  title?: string;
  onClick: () => void;
  variant?: "pill" | "icon";
}) {
  const inN = `${saved} ${plural(saved, "colección", "colecciones")}`;
  const label =
    saved === 0
      ? title ? `Guardar ${title}` : "Guardar"
      : title ? `${title}: guardado en ${inN}, cambiar` : `Guardado en ${inN}, cambiar`;
  const glyph = (size: number) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={saved > 0 ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
      aria-hidden
      className="flex-none"
    >
      <path d={BOOKMARK_PATH} />
    </svg>
  );

  if (variant === "pill") {
    return (
      <button type="button" onClick={onClick} aria-label={label} className={`${GLASS_BUTTON} flex-none pl-3.5`}>
        {glyph(16)}
        {saved === 0 ? "Guardar" : `En ${inN}`}
      </button>
    );
  }
  if (saved > 0) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className="flex h-11 min-w-11 flex-none items-center justify-center gap-1.5 rounded-full px-2 font-mono text-[11px] uppercase tracking-[0.06em] text-text-2 bl-press-sm"
      >
        {glyph(14)}
        {saved}
      </button>
    );
  }
  return (
    <button type="button" onClick={onClick} aria-label={label} className={CHIP_44}>
      {glyph(18)}
    </button>
  );
}

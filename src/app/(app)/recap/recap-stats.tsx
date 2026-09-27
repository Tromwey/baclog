import { BOOKMARK_PATH, CHECK_FILL_PATH, FLAME_PATH, REVIEW_PATH } from "@/components/glyph-paths";
import type { RecapMonth } from "@/modules/backlog/recap";

/**
 * The month's four numbers — completos · obsesiones · reseñas · guardados —
 * in a 2×2 (number in Newsreader, glyph + mono label). ONE set of metrics for
 * the recap and for "este mes" in Meses anteriores (critique 2026-09-27: the
 * two screens counted different things). `size` is the number's px.
 */
export function RecapStats({ month, size = 48 }: { month: RecapMonth; size?: number }) {
  const stats = [
    { v: month.completed, l: "completos", d: CHECK_FILL_PATH, c: "var(--st-completed)" },
    { v: month.obsessions, l: "obsesiones", d: FLAME_PATH, c: "var(--st-obsessed)" },
    { v: month.reviews, l: "reseñas", d: REVIEW_PATH, c: "var(--text)" },
    { v: month.saved, l: "guardados", d: BOOKMARK_PATH, c: "var(--text-2)" },
  ];
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-[18px] py-1.5">
      {stats.map((s) => (
        <div key={s.l} className="flex flex-col gap-1">
          <span className="font-brand leading-none text-text" style={{ fontSize: size }}>
            {s.v}
          </span>
          <span className="flex items-center gap-[7px] font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">
            <svg width="13" height="13" viewBox="0 0 24 24" fill={s.c} aria-hidden className="flex-none">
              <path d={s.d} />
            </svg>
            {s.l}
          </span>
        </div>
      ))}
    </div>
  );
}

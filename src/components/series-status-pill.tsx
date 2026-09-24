import {
  seriesStatusLabel,
  type SeriesStatus,
} from "@/modules/catalog/series-status";

/**
 * The series status as a quiet glass pill ("Terminada · 1 temporada"), Kura
 * style: mono 11 on glass, no dot (states are glyphs, never dots — and this is
 * a fact, not a state). Server-safe; renders nothing for null. The ficha now
 * writes the seasons into its data line and "En emisión" under its actions;
 * this stays for any surface that wants the pill.
 */
export function SeriesStatusPill({ status }: { status: SeriesStatus | null }) {
  if (!status) return null;
  return (
    <span className="inline-flex h-[26px] items-center self-start rounded-full bg-[var(--glass-bg)] px-3 font-mono text-[11px] uppercase tracking-[0.08em] text-text">
      {seriesStatusLabel(status)}
    </span>
  );
}

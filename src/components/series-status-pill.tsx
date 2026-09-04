import {
  seriesStatusLabel,
  type SeriesStatus,
} from "@/modules/catalog/series-status";

/**
 * The series status pill (Revamp UI 06c/06d): a glass pill, 7×12 padding, 11px
 * mono, a 7px dot before the text — accent for a finished series, radar for
 * one still airing. Server-safe (no client code); the data comes from
 * `getItemDisplayMedia().seriesStatus`. Renders nothing for null so callers
 * can pass it through unconditionally. Borderless (§7).
 */
export function SeriesStatusPill({ status }: { status: SeriesStatus | null }) {
  if (!status) return null;
  return (
    <span className="inline-flex items-center gap-[7px] self-start rounded-full bg-[var(--glass-bg)] px-3 py-[7px] font-mono text-[11px] uppercase tracking-[0.08em] text-text">
      <span
        aria-hidden
        className={`h-[7px] w-[7px] flex-none rounded-full ${status.kind === "ended" ? "bg-accent" : "bg-radar"}`}
      />
      {seriesStatusLabel(status)}
    </span>
  );
}

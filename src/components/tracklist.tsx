import type { AlbumTrack } from "@/modules/catalog/itunes";

function fmt(ms: number | null): string {
  if (!ms) return "";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Album tracklist — the album's answer to a film's synopsis (metadata/facts,
 * ADR-008 safe zone). Numbered rows separated by a content hairline divider,
 * which the borderless design system explicitly exempts (§7: content dividers
 * are fine; only surface borders/glows are banned). Renders nothing when the
 * lookup came back empty, so callers can drop it in unconditionally.
 */
export function Tracklist({ tracks }: { tracks: AlbumTrack[] }) {
  if (tracks.length === 0) return null;
  return (
    <section className="mt-7">
      <h2 className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-3">
        {tracks.length} canciones
      </h2>
      <ol className="mt-2 divide-y divide-white/[0.06]">
        {tracks.map((t, i) => (
          <li
            key={`${t.n}-${i}`}
            className="flex items-baseline gap-3 py-2.5 text-sm text-text"
          >
            <span className="w-5 shrink-0 font-mono text-xs tabular-nums text-text-3">
              {t.n || i + 1}
            </span>
            <span className="min-w-0 flex-1 leading-snug">{t.name}</span>
            {t.durationMs != null && (
              <span className="shrink-0 font-mono text-xs tabular-nums text-text-3">
                {fmt(t.durationMs)}
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

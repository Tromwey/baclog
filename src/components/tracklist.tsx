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
 *
 * F3.8 adds the PARTIAL mode for an album that hasn't come out. iTunes lists a
 * pre-order's advance singles by name and everything else as "Track 4" with
 * isStreamable false; getAlbumDetail already dropped those placeholders, so
 * what arrives here is only what you can actually play. The real track numbers
 * survive (01, 04, 09) — the gaps say what's missing better than a muted row
 * would, and the count of what's still coming goes in the closing divider.
 */
export function Tracklist({
  tracks,
  totalCount,
  pendingLabel,
}: {
  tracks: AlbumTrack[];
  /** The album's full song count. Greater than tracks.length ⇒ partial mode. */
  totalCount?: number;
  /** When the rest arrives: "el 14 de agosto" / "esta noche". Partial only. */
  pendingLabel?: string;
}) {
  if (tracks.length === 0) return null;

  const total = totalCount && totalCount > tracks.length ? totalCount : null;
  const pending = total ? total - tracks.length : 0;

  return (
    <section className="mt-7">
      {total ? (
        <div className="mb-2.5 flex items-baseline justify-between">
          <h2 className="font-serif text-[22px] italic leading-none text-text">
            Ya puedes oír
          </h2>
          <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-text-3">
            {tracks.length} de {total}
          </span>
        </div>
      ) : (
        <h2 className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-3">
          {tracks.length} canciones
        </h2>
      )}

      <ol className={total ? "divide-y divide-white/[0.06]" : "mt-2 divide-y divide-white/[0.06]"}>
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

      {/* A divider with a word in it, NOT a card: what's missing is an absence,
          and an empty state would give it more furniture than it deserves. */}
      {pending > 0 && (
        <div className="flex items-center gap-2.5 px-3 pb-0.5 pt-3.5">
          <span className="h-px flex-1 bg-line" />
          <span className="whitespace-nowrap text-[13px] text-text-3">
            {pending === 1 ? "1 canción más" : `${pending} canciones más`}
            {pendingLabel ? ` ${pendingLabel}` : ""}
          </span>
          <span className="h-px flex-1 bg-line" />
        </div>
      )}
    </section>
  );
}

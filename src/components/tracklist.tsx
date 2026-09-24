import type { AlbumTrack } from "@/modules/catalog/itunes";
import { SectionTitle } from "@/components/kura/components";

/**
 * "canciones" (Kura 24c / 37c) — the album's answer to a film's synopsis
 * (metadata/facts, ADR-008 safe zone): the section title in Newsreader 24,
 * then rows 48 tall — the number in mono (22 wide, two digits) and the name at
 * 15. No dividers: rows separate by rhythm. The aside carries the running time
 * when iTunes gave durations.
 *
 * PARTIAL mode (F3.8 / 37c "álbum anunciado"): iTunes lists a pre-order's
 * advance singles by name and everything else as placeholders, which
 * getAlbumDetail already dropped — so what arrives is only what you can play.
 * The real numbers survive (01, 04, 09), the aside reads "3 de 12
 * disponibles" and one closing mono line says when the rest arrives.
 * Server-safe; renders nothing for an empty list.
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
  const minutes = Math.round(tracks.reduce((ms, t) => ms + (t.durationMs ?? 0), 0) / 60_000);
  const aside = total ? `${tracks.length} de ${total} disponibles` : minutes > 0 ? `${minutes} min` : undefined;

  return (
    <section className="flex flex-col">
      <SectionTitle aside={aside}>canciones</SectionTitle>
      <div className="h-1.5" />
      <ol>
        {tracks.map((t, i) => (
          <li key={`${t.n}-${i}`} className="flex min-h-12 items-center gap-3.5">
            <span className="w-[22px] flex-none font-mono text-[12px] tabular-nums text-text-2">
              {String(t.n || i + 1).padStart(2, "0")}
            </span>
            <span className="min-w-0 flex-1 truncate text-[15px] text-text">{t.name}</span>
          </li>
        ))}
      </ol>
      {pending > 0 && (
        <p className="pt-2 font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">
          {pending === 1 ? "1 canción más" : `${pending} canciones más`}
          {pendingLabel ? ` ${pendingLabel}` : ""}
        </p>
      )}
    </section>
  );
}

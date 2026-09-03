"use client";

import Link from "next/link";
import { useState } from "react";
import { CoverTile, coverAspect } from "@/components/cover-tile";
import { UpcomingShelf, type UpcomingItem } from "@/components/upcoming-shelf";
import { PaletteGlow, Segmented, coverState, mixHexes } from "@/components/ui";
import { plural } from "@/lib/plural";
import type { MediaType } from "@/modules/catalog/types";
import { isUpcoming, shortWait } from "@/modules/catalog/release";
import type { Shelf } from "@/modules/backlog/shelves";

/**
 * The Backlogs list (Revamp UI screen 02, 2026-09-03): the kind filter, the
 * library-wide "No puede esperar" strip and every backlog as an `article` —
 * serif name + "N títulos", a strip of 150px covers at native aspect wearing
 * their state (or the wait pill), and the 3px progress line — all over a glow
 * mixed from the strip's palettes.
 *
 * Client because the filter is local state: picking Cine/Series/Música narrows
 * each strip to that kind (and the progress line to that kind's counts, from
 * the server's per-kind totals), hides backlogs with none of it, and narrows
 * the upcoming strip the same way. Todos = everything.
 *
 * Tapping the name row opens the backlog (a soft nav lands on the intercepted
 * zoom overlay, a hard nav on the full page); tapping a cover opens the title.
 */

type Kind = "all" | MediaType;

const KINDS: { key: Kind; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "film", label: "Cine" },
  { key: "series", label: "Series" },
  { key: "album", label: "Música" },
];

const EMPTY_KIND: Record<MediaType, string> = {
  film: "Sin cine en tus backlogs todavía.",
  series: "Sin series en tus backlogs todavía.",
  album: "Sin música en tus backlogs todavía.",
};

/** The strip shows this many at most, newest first. */
const STRIP_MAX = 12;

export function BacklogShelves({
  shelves,
  upcoming,
  now,
}: {
  shelves: Shelf[];
  upcoming: UpcomingItem[];
  /** The render instant every wait pill is measured from. */
  now: number;
}) {
  const [kind, setKind] = useState<Kind>("all");

  const visibleUpcoming =
    kind === "all" ? upcoming : upcoming.filter((u) => u.mediaType === kind);

  const visible = shelves.flatMap((s) => {
    const total = kind === "all" ? s.itemCount : s.byKind[kind].total;
    if (kind !== "all" && total === 0) return [];
    const done = kind === "all" ? s.doneCount : s.byKind[kind].done;
    const covers = (
      kind === "all" ? s.covers : s.covers.filter((c) => c.mediaType === kind)
    ).slice(0, STRIP_MAX);
    return [{ shelf: s, total, done, covers }];
  });

  return (
    <>
      <div className="px-5 pb-[22px]">
        <Segmented
          ariaLabel="Filtrar por tipo"
          segments={KINDS}
          value={kind}
          onSelect={(k) => setKind(k as Kind)}
        />
      </div>

      <UpcomingShelf items={visibleUpcoming} initialNow={now} />

      {visible.length === 0 ? (
        <p className="px-5 pt-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-text-3">
          {kind === "all" ? "Sin backlogs todavía." : EMPTY_KIND[kind]}
        </p>
      ) : (
        <div className="flex flex-col gap-[30px]">
          {visible.map(({ shelf, total, done, covers }) => (
            <ShelfArticle
              key={shelf.id}
              shelf={shelf}
              total={total}
              done={done}
              covers={covers}
              now={now}
            />
          ))}
        </div>
      )}
    </>
  );
}

function ShelfArticle({
  shelf,
  total,
  done,
  covers,
  now,
}: {
  shelf: Shelf;
  total: number;
  done: number;
  covers: Shelf["covers"];
  now: number;
}) {
  const glow = mixHexes(covers.map((c) => c.paletteHex ?? []));
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <article className="relative flex flex-col gap-3">
      <PaletteGlow hexes={glow} angle={110} opacity={0.35} className="inset-x-0 -inset-y-2.5" />

      <Link
        href={`/backlogs/${shelf.id}`}
        className="relative flex items-baseline gap-2.5 px-5 text-text"
      >
        <span className="min-w-0 truncate font-serif text-[28px] italic leading-[1.05]">
          {shelf.name}
        </span>
        <span className="ml-auto flex-none font-mono text-[10.5px] uppercase tracking-[0.1em] text-text-3">
          {total} {plural(total, "título", "títulos")}
        </span>
      </Link>

      {covers.length > 0 && (
        <div className="bl-scroll relative -mb-[26px] flex items-end gap-2 overflow-x-auto px-5 pb-[30px] pt-1">
          {covers.map((c) => {
            const upcoming = isUpcoming(c.releaseDate, now);
            return (
              <Link
                key={c.backlogItemId}
                href={`/item/${c.catalogItemId}`}
                aria-label={c.title}
                className="flex-none"
              >
                <CoverTile
                  posterUrl={c.posterUrl}
                  paletteHex={c.paletteHex}
                  alt={`Portada de ${c.title}`}
                  wait={upcoming && c.releaseDate ? shortWait(c.releaseDate, now) : null}
                  state={coverState(c)}
                  className={`h-[150px] ${coverAspect(c.mediaType)}`}
                />
              </Link>
            );
          })}
        </div>
      )}

      <div className="relative flex items-center gap-2.5 px-5">
        <span className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/10">
          <span className="block h-full bg-accent" style={{ width: `${pct}%` }} />
        </span>
        <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-text-2">
          {done} de {total}
        </span>
      </div>
    </article>
  );
}

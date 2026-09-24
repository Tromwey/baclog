"use client";

import Link from "next/link";
import { useState } from "react";
import { Cover, SectionTitle } from "@/components/kura/components";
import { releaseLabel, tintCard } from "@/components/kura/tint";
import type { UpcomingItem } from "@/components/upcoming-shelf";
import type { MediaType } from "@/modules/catalog/types";
import type {
  LatestDoubleFeature,
  RailWork,
} from "@/modules/recs/discover-rails";
import type { TrendingTitle } from "@/modules/social/trending";
import type { LibraryIndex } from "./library";
import type { SeenWork } from "./recents";
import type { SaveWork } from "./save-sheet";
import {
  KIND_NOUN,
  KIND_SHORT,
  KindTrack,
  PlusGlyph,
  SavedCount,
  SearchGlyph,
  inKind,
  type KindTab,
} from "./kura-bits";

/** One "recomendado para ti" card: a cached reco and the obsession behind it. */
export interface RecCard {
  work: RailWork;
  /** The obsessed title the rail hangs from — the kicker's "porque". */
  because: string;
}

/**
 * 19a — Descubrir's home: "descubrir" at 36, the search field (a button: the
 * real field lives in the search screen it opens), the format track, and the
 * sections, 34 apart:
 *
 *  - **recomendado para ti** — one tinted card per cached reco (the obsession
 *    rails, read from cache only: a visit never spends a generation), kicker
 *    "porque te obsesiona X", cover 132, italic title, byline, Guardar. More
 *    than one → the cards slide sideways, one object per surface.
 *  - **tendencias** — what the people you follow touched this week (the only
 *    trend the product measures), rank 1–5 in mono.
 *  - **próximos lanzamientos** — the releases still ahead in your own
 *    collections, cover 150 with the mono date.
 *  - **double feature** — the cross-media engine's card (not in the mock;
 *    the product keeps it), a flat tinted card instead of the old glow.
 *
 * The format track filters every section in place, as in the mock.
 */
export function DiscoverHome({
  recs,
  trending,
  upcoming,
  now,
  doubleFeature,
  hasLoved,
  totalTitles,
  library,
  pending,
  onSearch,
  onSave,
  onOpen,
  onRecomendar,
}: {
  recs: RecCard[];
  trending: TrendingTitle[];
  upcoming: UpcomingItem[];
  /** Server clock for the release labels — the client renders the same text. */
  now: number;
  doubleFeature: LatestDoubleFeature | null;
  hasLoved: boolean;
  totalTitles: number;
  library: LibraryIndex;
  pending: boolean;
  onSearch: () => void;
  onSave: (work: SaveWork) => void;
  onOpen: (work: SeenWork) => void;
  onRecomendar: () => void;
}) {
  const [tab, setTab] = useState<KindTab>("all");

  const shownRecs = recs.filter((r) => inKind(tab, r.work.mediaType)).slice(0, 6);
  const shownTrend = trending.filter((t) => inKind(tab, t.mediaType)).slice(0, 5);
  const shownSoon = upcoming.filter((u) => inKind(tab, u.mediaType));
  const nothingForKind =
    tab !== "all" &&
    shownRecs.length === 0 &&
    shownTrend.length === 0 &&
    shownSoon.length === 0;

  const savedIn = (id: string) => library.byTitle[id]?.length ?? 0;

  return (
    <div className="flex min-h-dvh flex-col pb-dock-clearance">
      <header className="px-5 pb-4 pt-[max(64px,calc(20px+env(safe-area-inset-top)))]">
        <h1 className="font-display text-[36px] font-normal leading-[1.02] text-text">
          descubrir
        </h1>
      </header>

      <div className="px-5">
        <button
          type="button"
          onClick={onSearch}
          className="flex h-12 w-full items-center gap-2.5 rounded-full bg-[var(--glass-bg)] px-4 text-left text-text-2 bl-press hover:bg-white/[0.1]"
        >
          <SearchGlyph />
          <span className="truncate text-[16px]">Películas, series y álbumes</span>
        </button>
      </div>

      <div className="px-5 pt-3.5">
        <KindTrack value={tab} onSelect={setTab} />
      </div>

      <div className="flex flex-col gap-[34px] pt-[26px]">
        {shownRecs.length > 0 && (
          <section className="flex flex-col gap-3.5">
            <div className="px-5">
              <SectionTitle>recomendado para ti</SectionTitle>
            </div>
            <div className="bl-scroll flex snap-x snap-mandatory scroll-px-3 gap-2 overflow-x-auto px-3">
              {shownRecs.map((r) => (
                <RecCardView
                  key={r.work.catalogItemId}
                  card={r}
                  single={shownRecs.length === 1}
                  saved={savedIn(r.work.catalogItemId)}
                  onSave={onSave}
                  onOpen={onOpen}
                />
              ))}
            </div>
          </section>
        )}

        {shownTrend.length > 0 && (
          <section className="flex flex-col gap-3.5">
            <div className="px-5">
              <SectionTitle aside="esta semana">tendencias</SectionTitle>
            </div>
            <ol className="flex flex-col">
              {shownTrend.map((t, i) => (
                <TrendRow
                  key={t.catalogItemId}
                  rank={i + 1}
                  row={t}
                  saved={savedIn(t.catalogItemId)}
                  onSave={onSave}
                  onOpen={onOpen}
                />
              ))}
            </ol>
          </section>
        )}

        {shownSoon.length > 0 && (
          <section className="flex flex-col gap-3.5">
            <div className="px-5">
              <SectionTitle aside="en tus colecciones">próximos lanzamientos</SectionTitle>
            </div>
            <div className="bl-scroll flex items-end gap-3 overflow-x-auto px-5 pb-4">
              {shownSoon.map((u) => (
                <SoonTile key={u.catalogItemId} item={u} now={now} onOpen={onOpen} />
              ))}
            </div>
          </section>
        )}

        {nothingForKind && (
          <div className="flex flex-col gap-3 px-7 pt-6">
            <p className="font-display text-[32px] leading-[1.1] text-text text-balance">
              nada de {KIND_NOUN[tab]} por aquí todavía.
            </p>
            <p className="text-[15px] leading-[1.5] text-text-2 text-pretty">
              Busca un título o vuelve a Todo.
            </p>
          </div>
        )}

        {tab === "all" && (
          <section className="flex flex-col gap-3.5">
            <div className="px-5">
              <SectionTitle>double feature</SectionTitle>
            </div>
            <DoubleFeatureCard
              pairing={doubleFeature}
              hasLoved={hasLoved}
              totalTitles={totalTitles}
              pending={pending}
              onRecomendar={onRecomendar}
            />
          </section>
        )}
      </div>
    </div>
  );
}

const seenOf = (w: {
  catalogItemId: string;
  title: string;
  mediaType: MediaType;
  posterUrl: string | null;
}): SeenWork => ({
  catalogItemId: w.catalogItemId,
  title: w.title,
  mediaType: w.mediaType,
  posterUrl: w.posterUrl,
});

/** Glass "Guardar" (19a) — or "Guardado" with the bookmark once it's in. */
function SaveButton({
  saved,
  title,
  onClick,
}: {
  saved: number;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={saved > 0 ? `${title}: guardado, cambiar colecciones` : `Guardar ${title}`}
      className="inline-flex h-11 items-center gap-2 self-start rounded-full bg-[var(--glass-bg)] pl-3 pr-4 text-[15px] font-semibold text-text bl-press hover:bg-white/[0.12]"
    >
      {saved > 0 ? (
        <>
          <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" aria-hidden className="flex-none">
            <path d="M7 2.6h10a2.2 2.2 0 012.2 2.2v16.6L12 17.6l-7.2 3.8V4.8A2.2 2.2 0 017 2.6z" />
          </svg>
          Guardado
        </>
      ) : (
        <>
          <PlusGlyph />
          Guardar
        </>
      )}
    </button>
  );
}

function RecCardView({
  card,
  single,
  saved,
  onSave,
  onOpen,
}: {
  card: RecCard;
  single: boolean;
  saved: number;
  onSave: (w: SaveWork) => void;
  onOpen: (w: SeenWork) => void;
}) {
  const w = card.work;
  const href = `/item/${w.catalogItemId}`;
  const open = () => onOpen(seenOf(w));
  return (
    <div
      className={`flex flex-none snap-start items-end gap-4 rounded-[var(--r-screen)] p-5 ${
        single ? "w-full" : "w-[calc(100%-36px)]"
      }`}
      style={{ background: tintCard(w.paletteHex) }}
    >
      <Link href={href} onClick={open} className="flex-none bl-press-lg" aria-label={w.title}>
        <Cover
          posterUrl={w.posterUrl}
          paletteHex={w.paletteHex}
          mediaType={w.mediaType}
          style={{ height: 132 }}
        />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="line-clamp-3 font-mono text-[10px] uppercase leading-[1.4] tracking-[0.08em] text-text-2">
          Porque te obsesiona {card.because}
        </span>
        <Link href={href} onClick={open} className="flex min-w-0 flex-col gap-2">
          <span className="line-clamp-3 font-serif text-[24px] italic leading-[1.1] text-text">
            {w.title}
          </span>
          {(w.byline || w.year) && (
            <span className="truncate text-[14px] text-text-2">
              {w.byline ?? `${KIND_SHORT[w.mediaType]} · ${w.year}`}
            </span>
          )}
        </Link>
        <span className="mt-1">
          <SaveButton saved={saved} title={w.title} onClick={() => onSave(w)} />
        </span>
      </div>
    </div>
  );
}

function TrendRow({
  rank,
  row,
  saved,
  onSave,
  onOpen,
}: {
  rank: number;
  row: TrendingTitle;
  saved: number;
  onSave: (w: SaveWork) => void;
  onOpen: (w: SeenWork) => void;
}) {
  const album = row.mediaType === "album";
  const meta = [
    KIND_SHORT[row.mediaType],
    row.year,
    row.count === 1 ? "1 de tu gente" : `${row.count} de tu gente`,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="flex min-h-[76px] items-center gap-3.5 px-5">
      <Link
        href={`/item/${row.catalogItemId}`}
        onClick={() => onOpen(seenOf(row))}
        className="flex min-w-0 flex-1 items-center gap-3.5 transition-opacity active:opacity-70"
      >
        <span className="w-[22px] flex-none font-mono text-[18px] text-text-2">{rank}</span>
        <span className="flex w-12 flex-none justify-center">
          <Cover
            posterUrl={row.posterUrl}
            paletteHex={row.paletteHex}
            mediaType={row.mediaType}
            radius="rounded-[var(--r-cover-s)]"
            style={{ height: album ? 51 : 64 }}
          />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-[5px]">
          <span className="truncate font-serif text-[19px] italic leading-[1.1] text-text">
            {row.title}
          </span>
          <span className="truncate font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">
            {meta}
          </span>
        </span>
      </Link>
      {saved > 0 ? (
        <button
          type="button"
          onClick={() => onSave(row)}
          aria-label={`${row.title}: guardado en ${saved}, cambiar colecciones`}
          className="flex h-11 min-w-11 flex-none items-center justify-center rounded-full px-2 bl-press-sm"
        >
          <SavedCount n={saved} />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => onSave(row)}
          aria-label={`Guardar ${row.title}`}
          className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-[var(--glass-bg)] text-text bl-press-sm hover:bg-white/[0.12]"
        >
          <PlusGlyph />
        </button>
      )}
    </li>
  );
}

function SoonTile({
  item,
  now,
  onOpen,
}: {
  item: UpcomingItem;
  now: number;
  onOpen: (w: SeenWork) => void;
}) {
  const width = item.mediaType === "album" ? 150 : 100;
  return (
    <Link
      href={`/item/${item.catalogItemId}`}
      onClick={() => onOpen(seenOf(item))}
      className="flex flex-none flex-col gap-[7px] bl-press-lg"
      style={{ width }}
    >
      <Cover
        posterUrl={item.posterUrl}
        paletteHex={item.paletteHex}
        mediaType={item.mediaType}
        alt={item.title}
        style={{ height: 150 }}
      />
      <span className="truncate font-serif text-[14px] italic text-text">{item.title}</span>
      <span className="truncate font-mono text-[10px] uppercase tracking-[0.08em] text-text-2">
        {releaseLabel(item.releaseDate, now)}
      </span>
    </Link>
  );
}

/**
 * The Double Feature card: the latest pairing (seed × reco) when there is
 * one, the generic invitation otherwise. Tapping runs the engine — unless
 * nothing is loved yet, and then the card says what unlocks it and walks to
 * the collections. Tinted by the two covers; without a pairing, `--s1`.
 */
function DoubleFeatureCard({
  pairing,
  hasLoved,
  totalTitles,
  pending,
  onRecomendar,
}: {
  pairing: LatestDoubleFeature | null;
  hasLoved: boolean;
  totalTitles: number;
  pending: boolean;
  onRecomendar: () => void;
}) {
  const a = pairing?.seed ?? null;
  const b = pairing?.reco ?? null;
  const hexes = [a?.paletteHex[0], b?.paletteHex[0]].filter((h): h is string => Boolean(h));
  const shell =
    "mx-3 flex items-end gap-4 rounded-[var(--r-screen)] p-5 text-left bl-press-lg";
  const style = { background: tintCard(hexes) };

  const covers = (
    <span className="flex flex-none items-end gap-1.5">
      {[a, b].map((w, i) =>
        w ? (
          <Cover
            key={w.catalogItemId}
            posterUrl={w.posterUrl}
            paletteHex={w.paletteHex}
            mediaType={w.mediaType}
            radius="rounded-[var(--r-cover-s)]"
            style={{ height: 96 }}
          />
        ) : (
          <span
            key={i}
            className="block h-24 w-16 flex-none rounded-[var(--r-cover-s)] bg-[var(--glass-bg)]"
          />
        ),
      )}
    </span>
  );

  const kicker = "font-mono text-[10px] uppercase leading-[1.4] tracking-[0.08em] text-text-2";
  const title = "font-serif text-[22px] italic leading-[1.1] text-text text-pretty";
  const line = "text-[15px] leading-[1.45] text-text-2 text-pretty";

  if (!hasLoved) {
    return (
      <Link href="/backlogs" className={shell} style={style}>
        {covers}
        <span className="flex min-w-0 flex-col gap-2">
          <span className={kicker}>En espera</span>
          <span className={title}>necesita saber qué te gusta.</span>
          <span className={line}>
            Marca un título con «me gusta» o «me obsesiona» y se enciende.{" "}
            <span className="font-semibold text-text">
              {totalTitles === 0 ? "Empieza una colección" : "Ir a tus colecciones"}
            </span>
          </span>
        </span>
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onRecomendar}
      disabled={pending}
      className={`${shell} disabled:opacity-60`}
      style={style}
    >
      {covers}
      <span className="flex min-w-0 flex-col gap-2">
        <span className={kicker}>La película y el disco que se sienten igual</span>
        <span className={title}>
          {a && b ? `${a.title} × ${b.title}` : "tu double feature"}
        </span>
        <span className={line}>{a && b ? "Ver la conexión" : "Encontrar una conexión"}</span>
      </span>
    </button>
  );
}

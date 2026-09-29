"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { FLAME_PATH } from "@/components/glyph-paths";
import { Cover, Seal } from "@/components/kura/components";
import { Fan } from "@/components/kura/fan";
import { SaveChip } from "@/components/kura/save-chip";
import { feedDockBand, feedSurface, releaseLabel, tintCard } from "@/components/kura/tint";
import type { UpcomingItem } from "@/components/upcoming-shelf";
import type { MediaType } from "@/modules/catalog/types";
import type {
  LatestDoubleFeature,
  RailWork,
} from "@/modules/recs/discover-rails";
import type { CollectionCard } from "@/modules/social/collection-cards";
import type { KuradaShelves } from "@/modules/social/kurada";
import type { TrendingTitle } from "@/modules/social/trending";
import type { LibraryIndex } from "./library";
import type { SeenWork } from "./recents";
import type { SaveWork } from "./save-sheet";
import { FormatPage } from "./format-pages";
import { KIND_SHORT, KindTrack, SearchGlyph, type KindTab } from "./kura-bits";

/** One "recomendado para ti" card: a cached reco and the obsession behind it. */
export interface RecCard {
  work: RailWork;
  /** The obsessed title the rail hangs from — the kicker's "porque". */
  because: string;
  /** That obsession's own work — its cover sits tilted behind the reco's (3a). */
  seed: RailWork | null;
}

/** A release still ahead in your library, with the collection it's filed in (3a). */
export type SoonItem = UpcomingItem & { collection: string | null };

/** The page tone with nothing to follow (no recommendation yet) — the mock's neutral. */
const NEUTRAL = ["#3a3a44", "#141417"];
/**
 * "recomendado para ti" on glass (founder, 2026-09-29 — the mock's "Vidrio"
 * card, twin of iOS 26 Liquid Glass `glassEffect(.regular)`): a light
 * translucent fill with blur + saturation so the page tint (which follows the
 * card in view) shows through, and the material's lit edge as INSET
 * highlights — part of the glass, not a border. The one content surface that
 * goes glass; every other card stays flat.
 */
const REC_GLASS =
  "bg-white/[0.07] backdrop-blur-[30px] backdrop-saturate-[1.8] shadow-[inset_0_1px_0_rgba(255,255,255,.22),inset_0_0_0_1px_rgba(255,255,255,.12),0_20px_40px_-24px_rgba(0,0,0,.6)]";

/** Dark glass for the controls over the tint (3a · "controles sobre vidrio"). */
const DARK_GLASS = "bg-[rgba(11,11,13,.35)] backdrop-blur-[14px]";

/**
 * Descubrir's home, Todo (Claude Design "Descubrir Final – Todo" 3a):
 * "descubrir" at 36, the search field (a button: the real field lives in the
 * search screen it opens) and the format track — both on dark glass so the
 * tint shows through — then the sections, 40 apart, titles at 22:
 *
 *  - **La página sigue a la recomendación**: the page is a feed surface in
 *    the tones of the recommendation card in view; sliding the carousel
 *    cross-fades it (0.6 s), and the band under the dock follows.
 *  - **recomendado para ti** + position dots — one tinted 340 card per cached
 *    reco (read from cache only: a visit never spends a generation): the
 *    obsession's cover tilted behind the reco's, the "porque" in two lines
 *    (mono label with the coral flame, then the obsession in italic), the
 *    title, the mono meta, Guardar.
 *  - **Para empezar** — with no recommendation yet, a card that explains the
 *    flame instead.
 *  - **colecciones para ti · de gente que sigues** — two-column fans.
 *  - **tendencias · esta semana** — rank 1–5.
 *  - **próximos lanzamientos · en tus colecciones** — the date on the cover,
 *    the collection under the title.
 *  - **una conexión** — the Double Feature card.
 *
 * Guardar keeps the product's one flow (the "guardar en" sheet, then its
 * toast) instead of the mock's instant "en pendientes" toast.
 *
 * Todo is this page. Cine, Series and Música on the format track are pages of
 * their own (Claude Design "Descubrir Final – Formatos" 2a–2c, `format-pages.tsx`):
 * "a cada formato se entra por la pista de arriba".
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
  kuradas,
  followedCollections,
  pending,
  onSearch,
  onSave,
  onOpen,
  onRecomendar,
}: {
  recs: RecCard[];
  trending: TrendingTitle[];
  upcoming: SoonItem[];
  /** Server clock for the release labels — the client renders the same text. */
  now: number;
  doubleFeature: LatestDoubleFeature | null;
  hasLoved: boolean;
  totalTitles: number;
  library: LibraryIndex;
  /** The team's collections per format (2a–2c's closing row). */
  kuradas: KuradaShelves;
  /** Showcased collections of people you follow (3a · "colecciones para ti"). */
  followedCollections: CollectionCard[];
  pending: boolean;
  onSearch: () => void;
  onSave: (work: SaveWork) => void;
  onOpen: (work: SeenWork) => void;
  onRecomendar: () => void;
}) {
  const [tab, setTab] = useState<KindTab>("all");
  /** The recommendation card in view — what the page is tinted with. */
  const [active, setActive] = useState(0);

  if (tab !== "all") {
    return (
      <FormatPage
        tab={tab}
        onTab={setTab}
        onSearch={onSearch}
        library={library}
        kuradas={kuradas[tab]}
        upcoming={upcoming}
        now={now}
        onSave={onSave}
        onOpen={onOpen}
      />
    );
  }

  const shownRecs = recs.slice(0, 6);
  const shownTrend = trending.slice(0, 5);
  const shownSoon = upcoming;
  const current = Math.min(active, Math.max(0, shownRecs.length - 1));
  const tones = (r: RecCard | undefined) => (r?.work.paletteHex.length ? r.work.paletteHex : NEUTRAL);
  const hexes = shownRecs.length > 0 ? tones(shownRecs[current]) : NEUTRAL;

  const savedIn = (id: string) => library.byTitle[id]?.length ?? 0;

  return (
    <div className="relative flex min-h-dvh flex-col pb-dock-clearance">
      {/* The page follows the recommendation: one surface per card, cross-faded. */}
      {(shownRecs.length > 0 ? shownRecs : [undefined]).map((r, i) => (
        <span
          key={r?.work.catalogItemId ?? "neutral"}
          aria-hidden
          className="pointer-events-none absolute inset-0 transition-opacity duration-[600ms] ease-out motion-reduce:transition-none"
          style={{ background: feedSurface(tones(r), 760), opacity: !r || i === current ? 1 : 0 }}
        />
      ))}

      <div className="relative flex flex-col">
        <header className="px-5 pb-4 pt-[max(64px,calc(20px+env(safe-area-inset-top)))]">
          <h1 className="font-display text-[36px] font-normal leading-[1.02] text-text">
            descubrir
          </h1>
        </header>

        <div className="px-5">
          <button
            type="button"
            onClick={onSearch}
            className={`flex h-12 w-full items-center gap-2.5 rounded-full px-4 text-left text-text-2 bl-press ${DARK_GLASS}`}
          >
            <SearchGlyph />
            <span className="truncate text-[16px]">Películas, series y álbumes</span>
          </button>
        </div>

        <div className="px-5 pt-3">
          <KindTrack value={tab} onSelect={setTab} surface={DARK_GLASS} />
        </div>

        {shownRecs.length === 0 && <FirstSteps />}

        {shownRecs.length > 0 && (
          <section className="flex flex-col gap-3.5 pt-8">
            <div className="flex items-center justify-between gap-3 px-5">
              <h2 className="font-display text-[22px] leading-[1.1] text-text">recomendado para ti</h2>
              {shownRecs.length > 1 && (
                <span aria-hidden className="flex items-center gap-1">
                  {shownRecs.map((r, i) => (
                    <span
                      key={r.work.catalogItemId}
                      className="h-1.5 rounded-full bg-text transition-[width,opacity] duration-300"
                      style={{ width: i === current ? 18 : 6, opacity: i === current ? 1 : 0.35 }}
                    />
                  ))}
                </span>
              )}
            </div>
            <div
              className="bl-scroll flex snap-x snap-mandatory scroll-px-3 gap-2 overflow-x-auto px-3"
              onScroll={(e) => {
                const card = e.currentTarget.firstElementChild as HTMLElement | null;
                const step = (card?.offsetWidth ?? 340) + 8;
                const i = Math.round(e.currentTarget.scrollLeft / step);
                if (i !== current) setActive(Math.max(0, Math.min(shownRecs.length - 1, i)));
              }}
            >
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

        {followedCollections.length > 0 && (
          <section className="flex flex-col gap-[18px] pt-10">
            <SectionHead aside="de gente que sigues">colecciones para ti</SectionHead>
            <div className="grid grid-cols-2 gap-x-3 gap-y-7 px-5">
              {followedCollections.map((c) => (
                <CollectionTile key={c.id} card={c} />
              ))}
            </div>
          </section>
        )}

        {shownTrend.length > 0 && (
          <section className="flex flex-col gap-2 pt-10">
            <SectionHead aside="esta semana">tendencias</SectionHead>
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
          <section className="flex flex-col gap-3.5 pt-9">
            <SectionHead aside="en tus colecciones">próximos lanzamientos</SectionHead>
            <div className="bl-scroll flex items-end gap-3 overflow-x-auto px-5 pb-4">
              {shownSoon.map((u) => (
                <SoonTile key={u.catalogItemId} item={u} now={now} onOpen={onOpen} />
              ))}
            </div>
          </section>
        )}

        <section className="flex flex-col gap-3.5 pt-10">
          <SectionHead>una conexión</SectionHead>
          <DoubleFeatureCard
            pairing={doubleFeature}
            hasLoved={hasLoved}
            totalTitles={totalTitles}
            pending={pending}
            onRecomendar={onRecomendar}
          />
        </section>
      </div>

      {/* The dock floats over the page's own bottom tone, and follows the card. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 bottom-0 h-[150px] transition-[background] duration-[600ms]"
        style={{ background: feedDockBand(hexes) }}
      />
    </div>
  );
}

/** A section title at 22 with the optional mono note on the right (3a · "ritmo"). */
function SectionHead({ children, aside }: { children: ReactNode; aside?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-5">
      <h2 className="font-display text-[22px] leading-[1.1] text-text">{children}</h2>
      {aside && (
        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">{aside}</span>
      )}
    </div>
  );
}

function FlameGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="var(--obsessing)" aria-hidden className="flex-none">
      <path d={FLAME_PATH} />
    </svg>
  );
}

/** 3a · Cuenta nueva: with nothing to recommend yet, explain what lights it up. */
function FirstSteps() {
  return (
    <div className="mx-3 mt-7 flex flex-col gap-2.5 rounded-[26px] bg-[var(--glass-bg)] px-5 py-[22px]">
      <span className="inline-flex h-[30px] items-center gap-2 self-start rounded-full bg-[var(--glass-bg)] px-3.5 font-mono text-[12px] uppercase tracking-[0.06em] text-text">
        <FlameGlyph size={13} />
        Para empezar
      </span>
      <p className="m-0 font-display text-[24px] leading-[1.15] text-text text-balance">
        descubrir aprende de tus obsesiones.
      </p>
      <p className="m-0 text-[15px] leading-[1.5] text-text-2 text-pretty">
        Marca algo con la llama en cualquier ficha y aquí aparecen títulos que se le parecen.
      </p>
    </div>
  );
}

/** 3a · a followed person's collection: the fan, its name, their seal · the count. */
function CollectionTile({ card }: { card: CollectionCard }) {
  return (
    <Link
      href={`/u/${card.username}/${card.id}`}
      className="flex min-w-0 flex-col items-center gap-2 text-center bl-press-lg"
    >
      <span className="flex h-[150px] items-end justify-center">
        <Fan covers={card.fan} lead={118}label={`Portadas de ${card.name}`} />
      </span>
      <span className="line-clamp-2 font-display text-[18px] leading-[1.1] text-text text-balance">
        {card.name}
      </span>
      <span className="flex min-w-0 max-w-full items-center gap-1.5">
        <Seal name={card.username} hexes={card.hexes} src={card.avatarUrl} size={22} />
        <span className="truncate text-[13px] text-text-2">
          @{card.username} · {card.count} {card.count === 1 ? "título" : "títulos"}
        </span>
      </span>
    </Link>
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
  const seed = card.seed;
  const href = `/item/${w.catalogItemId}`;
  const open = () => onOpen(seenOf(w));
  const album = w.mediaType === "album";
  const seedAlbum = seed?.mediaType === "album";
  // 3a geometry: the reco's cover in front (88×132 · disc 116), the
  // obsession's behind it, tilted −9° (60×90 · disc 70).
  const box = { width: album ? 140 : 118, height: 146 };
  const meta = [KIND_SHORT[w.mediaType], w.year, w.byline].filter(Boolean).join(" · ");
  return (
    <div
      className={`flex flex-none snap-start items-end gap-[18px] rounded-[26px] p-5 ${REC_GLASS} ${
        single ? "w-full" : "w-[340px] max-w-[calc(100%-36px)]"
      }`}
    >
      <Link href={href} onClick={open} className="relative flex-none bl-press-lg" style={box} aria-label={w.title}>
        {seed && (
          <Cover
            posterUrl={seed.posterUrl}
            paletteHex={seed.paletteHex}
            mediaType={seed.mediaType}
            radius="rounded-[10px]"
            className="!absolute left-0 top-1.5 -rotate-[9deg]"
            style={{ width: seedAlbum ? 70 : 60 }}
          />
        )}
        <Cover
          posterUrl={w.posterUrl}
          paletteHex={w.paletteHex}
          mediaType={w.mediaType}
          radius="rounded-[12px]"
          className="!absolute bottom-0 right-0"
          style={{ width: album ? 116 : 88 }}
        />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-text-2">
            <FlameGlyph size={11} />
            Porque te obsesiona
          </span>
          <span className="truncate font-serif text-[14px] italic text-text">{card.because}</span>
        </span>
        <Link href={href} onClick={open} className="flex min-w-0 flex-col gap-2">
          <span className="line-clamp-3 font-serif text-[24px] italic leading-[1.1] text-text text-balance">
            {w.title}
          </span>
          {meta && (
            <span className="truncate font-mono text-[10px] uppercase tracking-[0.08em] text-text-2">
              {meta}
            </span>
          )}
        </Link>
        <span className="mt-1">
          <SaveChip variant="pill" saved={saved} title={w.title} onClick={() => onSave(w)} />
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
    row.count === 1 ? "1 persona" : `${row.count} personas`,
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
      <SaveChip saved={saved} title={row.title} onClick={() => onSave(row)} />
    </li>
  );
}

function SoonTile({
  item,
  now,
  onOpen,
}: {
  item: SoonItem;
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
      {/* 3a: the date rides on the cover (the lavender clock pill); the
          collection it's filed in reads under the title. */}
      <Cover
        posterUrl={item.posterUrl}
        paletteHex={item.paletteHex}
        mediaType={item.mediaType}
        alt={item.title}
        radius="rounded-[14px]"
        wait={releaseLabel(item.releaseDate, now)}
        style={{ height: 150 }}
      />
      <span className="truncate font-serif text-[14px] italic text-text">{item.title}</span>
      {item.collection && (
        <span className="truncate font-serif text-[13px] text-text-2">{item.collection}</span>
      )}
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
          {a && b ? `${a.title} × ${b.title}` : "tu primera conexión"}
        </span>
        <span className={line}>{a && b ? "Ver la conexión" : "Encontrar una conexión"}</span>
      </span>
    </button>
  );
}

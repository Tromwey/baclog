"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { BOOKMARK_PATH, PLAY_PATH } from "@/components/glyph-paths";
import { CHIP_ART, Cover, GLASS_BUTTON, SKELETON_PULSE } from "@/components/kura/components";
import { Fan } from "@/components/kura/fan";
import { feedDockBand, feedSurface, feedTail, releaseLabel, tintCard } from "@/components/kura/tint";
import type { UpcomingItem } from "@/components/upcoming-shelf";
import {
  getCineShelfAction,
  getMaratonShelfAction,
  getMusicShelfAction,
} from "@/app/actions/discover-format-actions";
import {
  CINE_MOODS,
  CINE_TIMES,
  GENRE_ES,
  MUSIC_MOODS,
  SERIES_LENSES,
  hoursLabel,
  inCineMood,
  inMusicMood,
  type AlbumWork,
  type CineTime,
  type CineWork,
  type SeriesWork,
  type ShelfWork,
} from "@/modules/catalog/format-moods";
import type { MediaType } from "@/modules/catalog/types";
import type { KuradaCard } from "@/modules/social/kurada";
import type { LibraryIndex } from "./library";
import type { SeenWork } from "./recents";
import type { SaveWork } from "./save-sheet";
import { DiscoverTop, type KindTab } from "./kura-bits";

/**
 * Descubrir · por formato (Claude Design "Descubrir Final – Formatos", 2a–2c).
 * "A cada formato se entra por la pista de arriba": picking Cine, Series or
 * Música on the track swaps Todo's sections for that format's own page —
 *
 *  - 2a **Cine · tiempo y humor**: "¿cuánto tiempo tienes?" (three runtime
 *    windows) and an OPTIONAL "¿y de qué humor?" (tap the picked one again to
 *    clear it); both filter the 2:3 grid together, and a picked humor tints
 *    the page.
 *  - 2b **Series · maratón**: finished miniseries under two lenses (una tarde
 *    ≤ 5 h · un fin de semana ≤ 12 h); the pill is the whole series' hours,
 *    the meta the network and episodes; Guardar sits on the poster.
 *  - 2c **Música · por momento**: moments read from the chart's genres; the
 *    picked one tints the page. Albums 1:1, then "próximos álbumes" — the
 *    most anticipated albums on Kura (`getMostAnticipated`, albums only).
 *
 * Every page closes with **Colecciones Kuradas** (the team's public
 * collections, `modules/social/kurada.ts`), hidden when there are none. The
 * page is a feed surface (`feedSurface` 760 + its tail and the dock band).
 * Shelves are fetched when a page first opens and kept for the visit (they're
 * the same for everyone), so the viewer's own titles are filtered HERE, on
 * the client: nothing already in the library shows (founder: "no tiene caso
 * ver cosas que ya conoces"), against `owned` — the library as it was when
 * Descubrir loaded, so a title saved during the visit keeps its tile.
 */

type Format = Exclude<KindTab, "all">;

/** One shelf per key for the whole visit (they're the same for everyone),
 *  and the fetch in flight so flipping tabs never asks twice. Only a shelf
 *  that CAME BACK WITH TITLES is kept for the visit. The other two outcomes
 *  are different things and read differently:
 *   - the read FAILED (the action rejected: network, session, stale build) →
 *     `failed`, and the page offers Reintentar;
 *   - the read came back EMPTY → `data` is `[]` and the page says there is
 *     nothing for now — no Reintentar pretending something broke. It is not
 *     cached, so opening the page again asks again.
 *  The shelf actions THROW when their provider is down, so an outage lands
 *  in the first case, never in the second. */
const shelfCache = new Map<string, unknown>();
const inFlight = new Map<string, Promise<unknown>>();

interface Shelf<T> {
  /** null while loading (or after a failure — see `failed`); `[]` = the
   *  shelf answered and has nothing. */
  data: T[] | null;
  failed: boolean;
  retry: () => void;
}

function useShelf<T>(key: string, load: () => Promise<T[]>): Shelf<T> {
  const [, rerender] = useState(0);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [emptyKey, setEmptyKey] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  // A NEW read of a key starts clean: coming back to a shelf that failed (or
  // answered empty) earlier re-asks, and what paints meanwhile is the
  // skeleton — not the old error. (State adjusted during render, React's
  // pattern for "reset when a prop changes"; an effect would paint the stale
  // error for a frame.)
  const [readKey, setReadKey] = useState(key);
  if (readKey !== key) {
    setReadKey(key);
    setFailedKey(null);
    setEmptyKey(null);
  }
  useEffect(() => {
    if (shelfCache.has(key)) return;
    let live = true;
    let request = inFlight.get(key) as Promise<T[]> | undefined;
    if (!request) {
      request = load().then((value) => {
        if (value.length > 0) shelfCache.set(key, value);
        return value;
      });
      const mine = request;
      const done = () => {
        if (inFlight.get(key) === mine) inFlight.delete(key);
      };
      mine.then(done, done);
      inFlight.set(key, mine);
    }
    request.then(
      (value) => {
        if (!live) return;
        if (value.length === 0) setEmptyKey(key);
        else rerender((n) => n + 1);
      },
      () => {
        if (live) setFailedKey(key);
      },
    );
    return () => {
      live = false;
    };
    // `load` is a fresh closure every render; the key (and a retry) is what
    // identifies the read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tries]);
  const cached = (shelfCache.get(key) as T[] | undefined) ?? null;
  const data = cached ?? (emptyKey === key ? [] : null);
  return {
    data,
    failed: data === null && failedKey === key,
    retry: () => {
      setFailedKey(null);
      setEmptyKey(null);
      setTries((n) => n + 1);
    },
  };
}

const seenOf = (w: ShelfWork): SeenWork => ({
  catalogItemId: w.catalogItemId,
  title: w.title,
  mediaType: w.mediaType,
  posterUrl: w.posterUrl,
});

const saveOf = (w: ShelfWork): SaveWork => ({
  catalogItemId: w.catalogItemId,
  title: w.title,
  mediaType: w.mediaType,
  year: w.year,
  byline: w.byline,
  posterUrl: w.posterUrl,
  paletteHex: w.paletteHex,
});

export interface FormatPageProps {
  tab: Format;
  onTab: (k: KindTab) => void;
  onSearch: () => void;
  library: LibraryIndex;
  /** The library at load: never listed on these pages. */
  owned: ReadonlySet<string>;
  kuradas: KuradaCard[];
  upcoming: UpcomingItem[];
  now: number;
  onSave: (work: SaveWork) => void;
  onOpen: (work: SeenWork) => void;
  /** Cine's two answers. Held by the screen (with `tab`), so opening the
   *  search and cancelling it comes back to the same page, same filters. */
  cine: CineFilters;
  onCine: (next: CineFilters) => void;
}

export interface CineFilters {
  time: CineTime;
  mood: number | null;
}

export const CINE_DEFAULT: CineFilters = { time: 1, mood: null };

export function FormatPage(props: FormatPageProps) {
  if (props.tab === "film") return <CinePage {...props} />;
  if (props.tab === "series") return <SeriesPage {...props} />;
  return <MusicPage {...props} />;
}

/* ------------------------------------------------------------- el marco */

function Frame({
  hexes,
  tab,
  onTab,
  onSearch,
  kuradas,
  children,
  after,
}: {
  hexes: readonly string[];
  tab: Format;
  onTab: (k: KindTab) => void;
  onSearch: () => void;
  kuradas: KuradaCard[];
  children: ReactNode;
  /** What follows the Kurada row (2c's releases). */
  after?: ReactNode;
}) {
  return (
    <div
      className="flex min-h-dvh flex-col pb-dock-clearance"
      style={{ background: feedSurface(hexes, 760), backgroundColor: feedTail(hexes) }}
    >
      <DiscoverTop tab={tab} onTab={onTab} onSearch={onSearch} />

      {children}

      <Kuradas cards={kuradas} format={tab} />
      {after}

      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 bottom-0 h-[150px]"
        style={{ background: feedDockBand(hexes) }}
      />
    </div>
  );
}

/** "¿cuánto tiempo tienes?" · "una tarde" — the 52 two-line choice pill. */
function ChoicePill({
  label,
  sub,
  on,
  onClick,
}: {
  label: string;
  sub: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`flex min-h-[52px] flex-col justify-center gap-px rounded-full px-[18px] py-1.5 text-left transition-colors duration-200 ${
        on ? "bg-white/[0.22]" : "bg-white/[0.075] hover:bg-white/[0.12]"
      }`}
    >
      <span className="text-[15px] font-semibold text-text">{label}</span>
      <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-text-2">{sub}</span>
    </button>
  );
}

/** The humor / moment swatches: a 64 disc in the mood's tones, ringed when picked. */
function MoodRow({
  moods,
  value,
  label,
  onPick,
}: {
  moods: { label: string; hexes: readonly string[] }[];
  value: number | null;
  label: string;
  onPick: (i: number) => void;
}) {
  return (
    <div role="group" aria-label={label} className="bl-scroll flex gap-2.5 overflow-x-auto px-5 pb-1.5 pt-1">
      {moods.map((m, i) => {
        const on = value === i;
        return (
          <button
            key={m.label}
            type="button"
            aria-pressed={on}
            onClick={() => onPick(i)}
            className="flex w-[76px] flex-none flex-col items-center gap-[9px]"
          >
            <span
              className="block h-16 w-16 rounded-full transition-shadow duration-200"
              style={{
                background: swatch(m.hexes),
                boxShadow: on
                  ? "0 0 0 3px rgba(11,11,13,.9), 0 0 0 5px var(--text)"
                  : "0 10px 20px -10px rgba(0,0,0,.8)",
              }}
            />
            <span className={`text-center text-[13px] leading-[1.2] ${on ? "text-text" : "text-text-2"}`}>
              {m.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** A mood's swatch: its two tones, lit from the top left (the mock's recipe). */
function swatch([a, b]: readonly string[]): string {
  const [r, g, bl] = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  return `radial-gradient(90% 70% at 30% 20%, rgba(${r},${g},${bl},.55) 0%, rgba(${r},${g},${bl},0) 70%), linear-gradient(160deg, ${a} 0%, ${b ?? a} 100%)`;
}

const QUESTION = "m-0 px-5 font-display text-[34px] leading-[1.05] text-text text-balance";
const META = "flex min-w-0 items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-text-2";

function GridSkeleton({ square = false }: { square?: boolean }) {
  return (
    <div aria-hidden className="grid grid-cols-2 gap-x-3 gap-y-6 px-5 pt-[26px]">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex flex-col gap-[7px]">
          <span
            className={`block w-full rounded-[14px] bg-white/[0.06] ${square ? "aspect-square" : "aspect-[2/3]"} ${SKELETON_PULSE}`}
          />
          <span className={`block h-4 w-3/4 rounded-full bg-white/[0.06] ${SKELETON_PULSE}`} />
        </div>
      ))}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="m-0 px-5 pt-[26px] text-[15px] leading-[1.5] text-text-2 text-pretty">{children}</p>;
}

/** The shelf didn't come (§patrones · error): what happened, and Reintentar in glass. */
function ShelfFailed({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3.5 px-5 pt-[26px]">
      <p className="m-0 text-[15px] leading-[1.5] text-text-2 text-pretty">
        No pudimos traer {what}.
      </p>
      <button type="button" onClick={onRetry} className={GLASS_BUTTON}>
        Reintentar
      </button>
    </div>
  );
}

/** A grid tile: the cover (with its pill / chip), italic title, mono meta. */
function Tile({
  work,
  pill,
  meta,
  onOpen,
  chip,
}: {
  work: ShelfWork;
  pill?: string;
  meta: ReactNode;
  onOpen: (w: SeenWork) => void;
  chip?: ReactNode;
}) {
  const href = `/item/${work.catalogItemId}`;
  return (
    <div className="flex min-w-0 flex-col gap-[7px]">
      <div className="relative">
        <Link href={href} onClick={() => onOpen(seenOf(work))} className="block bl-press-lg" aria-label={work.title}>
          <Cover
            posterUrl={work.posterUrl}
            paletteHex={work.paletteHex}
            mediaType={work.mediaType}
            radius="rounded-[14px]"
            className="w-full"
          />
          {pill && (
            <span className="absolute bottom-2 left-2 inline-flex h-[26px] items-center rounded-full bg-glass-art px-2.5 font-mono text-[11px] tracking-[0.04em] text-text backdrop-blur-[14px]">
              {pill}
            </span>
          )}
        </Link>
        {chip}
      </div>
      <Link
        href={href}
        onClick={() => onOpen(seenOf(work))}
        className="truncate font-serif text-[18px] italic leading-[1.15] text-text"
      >
        {work.title}
      </Link>
      <span className={META}>{meta}</span>
    </div>
  );
}

/** Guardar over a poster (2b): the 44 art chip, bookmark filled once saved. */
function PosterSave({ work, saved, onSave }: { work: ShelfWork; saved: number; onSave: (w: SaveWork) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSave(saveOf(work))}
      aria-label={saved > 0 ? `${work.title}: guardado, cambiar` : `Guardar ${work.title}`}
      className={`${CHIP_ART} absolute right-1.5 top-1.5`}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill={saved > 0 ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d={BOOKMARK_PATH} />
      </svg>
    </button>
  );
}

const TICKET_PATH =
  "M4 6.5A1.5 1.5 0 015.5 5h13A1.5 1.5 0 0120 6.5V9a2.5 2.5 0 000 5v2.5a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 16.5V14a2.5 2.5 0 000-5z";

function MetaGlyph({ d }: { d: string }) {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden className="flex-none">
      <path d={d} />
    </svg>
  );
}

/* -------------------------------------------------------------- 2a cine */

function CinePage(props: FormatPageProps) {
  const { time, mood } = props.cine;
  const setTime = (next: CineTime) => props.onCine({ time: next, mood });
  const setMood = (next: number | null) => props.onCine({ time, mood: next });
  const shelf = useShelf<CineWork>(`cine:${time}`, () => getCineShelfAction(time));
  const films = shelf.data;
  const fresh = (films ?? []).filter((f) => !props.owned.has(f.catalogItemId));
  const shown = fresh.filter((f) => inCineMood(mood, f)).slice(0, 12);
  const hexes =
    mood !== null ? CINE_MOODS[mood].hexes : (shown[0]?.paletteHex ?? films?.[0]?.paletteHex ?? []);

  return (
    <Frame hexes={hexes} tab="film" onTab={props.onTab} onSearch={props.onSearch} kuradas={props.kuradas}>
      <p className={`${QUESTION} pb-4 pt-8`}>¿cuánto tiempo tienes?</p>
      <div className="flex flex-wrap gap-2 px-5">
        {CINE_TIMES.map((t, i) => (
          <ChoicePill key={t.label} label={t.label} sub={t.sub} on={time === i} onClick={() => setTime(i as CineTime)} />
        ))}
      </div>

      <p className="m-0 px-5 pb-3.5 pt-[30px] font-display text-[22px] text-text">¿y de qué humor?</p>
      <MoodRow
        moods={CINE_MOODS}
        value={mood}
        label="Humor"
        onPick={(i) => setMood(mood === i ? null : i)}
      />

      {shelf.failed ? (
        <ShelfFailed what="películas" onRetry={shelf.retry} />
      ) : films === null ? (
        <GridSkeleton />
      ) : shown.length === 0 ? (
        <Empty>
          {films.length === 0
            ? "No hay películas de este tiempo por ahora. Prueba otra duración."
            : fresh.length === 0
            ? "Ya tienes todas las de este tiempo. Prueba otra duración."
            : mood === null
              ? "Nada nuevo en ese tiempo por ahora. Prueba otra duración."
              : "Nada con ese humor en ese tiempo. Prueba otra duración o quita el humor."}
        </Empty>
      ) : (
        <div className="grid grid-cols-2 gap-x-3 gap-y-6 px-5 pt-[26px]">
          {shown.map((f) => (
            <Tile
              key={f.catalogItemId}
              work={f}
              pill={f.runtime ? `${f.runtime} min` : undefined}
              onOpen={props.onOpen}
              meta={
                f.inCinemas ? (
                  <>
                    <MetaGlyph d={TICKET_PATH} />
                    <span className="truncate">En cines</span>
                  </>
                ) : (
                  <span className="truncate">
                    {[f.year, f.genre ? GENRE_ES[f.genre] : null].filter(Boolean).join(" · ")}
                  </span>
                )
              }
            />
          ))}
        </div>
      )}
    </Frame>
  );
}

/* ------------------------------------------------------------ 2b series */

function SeriesPage(props: FormatPageProps) {
  const [lens, setLens] = useState(1);
  const shelf = useShelf<SeriesWork>("series", () => getMaratonShelfAction());
  const all = shelf.data;
  const shown = (all ?? [])
    .filter((s) => !props.owned.has(s.catalogItemId) && s.minutes <= SERIES_LENSES[lens].maxMinutes)
    .slice(0, 12);
  const hexes = shown[0]?.paletteHex ?? [];
  const savedIn = (id: string) => props.library.byTitle[id]?.length ?? 0;

  return (
    <Frame hexes={hexes} tab="series" onTab={props.onTab} onSearch={props.onSearch} kuradas={props.kuradas}>
      <p className="m-0 px-5 pb-[18px] pt-8 font-display text-[34px] leading-none text-text">para maratonear</p>
      <div className="flex gap-2 px-5">
        {SERIES_LENSES.map((l, i) => (
          <ChoicePill key={l.label} label={l.label} sub={l.sub} on={lens === i} onClick={() => setLens(i)} />
        ))}
      </div>

      {shelf.failed ? (
        <ShelfFailed what="series" onRetry={shelf.retry} />
      ) : all === null ? (
        <GridSkeleton />
      ) : shown.length === 0 ? (
        <Empty>
          {/* Only point at the longer lens while there IS a longer one. */}
          {all.length === 0
            ? "No hay series para maratonear por ahora. Vuelve en unos días."
            : lens < SERIES_LENSES.length - 1
            ? `Nada tan corto por ahora. Prueba con ${SERIES_LENSES[lens + 1].label}.`
            : "Nada nuevo para maratonear por ahora. Vuelve en unos días."}
        </Empty>
      ) : (
        <div className="grid grid-cols-2 gap-x-3 gap-y-6 px-5 pt-[26px]">
          {shown.map((s) => (
            <Tile
              key={s.catalogItemId}
              work={s}
              pill={hoursLabel(s.minutes)}
              onOpen={props.onOpen}
              chip={<PosterSave work={s} saved={savedIn(s.catalogItemId)} onSave={props.onSave} />}
              meta={
                <>
                  <MetaGlyph d={PLAY_PATH} />
                  <span className="truncate">
                    {[s.network, `${s.episodes} ep`].filter(Boolean).join(" · ")}
                  </span>
                </>
              }
            />
          ))}
        </div>
      )}
    </Frame>
  );
}

/* ------------------------------------------------------------ 2c música */

function MusicPage(props: FormatPageProps) {
  const shelf = useShelf<AlbumWork>("music", () => getMusicShelfAction());
  const albums = shelf.data;
  const [picked, setPicked] = useState<number | null>(null);
  // Until a moment is picked, open on the first one the chart can fill.
  const fresh = albums?.filter((a) => !props.owned.has(a.catalogItemId)) ?? null;
  const first = fresh ? MUSIC_MOODS.findIndex((_, i) => fresh.some((a) => inMusicMood(i, a.genre))) : -1;
  const mood = picked ?? Math.max(0, first);
  const shown = (fresh ?? []).filter((a) => inMusicMood(mood, a.genre)).slice(0, 8);
  const soon = props.upcoming.filter((u) => u.mediaType === "album");

  return (
    <Frame
      hexes={MUSIC_MOODS[mood].hexes}
      tab="album"
      onTab={props.onTab}
      onSearch={props.onSearch}
      kuradas={props.kuradas}
      after={soon.length > 0 && <SoonDiscs items={soon} now={props.now} onOpen={props.onOpen} />}
    >
      <p className={`${QUESTION} pb-[18px] pt-8`}>¿para qué momento?</p>
      <MoodRow moods={MUSIC_MOODS} value={mood} label="Momento" onPick={setPicked} />

      {shelf.failed ? (
        <ShelfFailed what="álbumes" onRetry={shelf.retry} />
      ) : albums === null ? (
        <GridSkeleton square />
      ) : shown.length === 0 ? (
        <Empty>
          {albums.length === 0
            ? "No hay álbumes aquí por ahora. Vuelve en unos días."
            : "Nada para ese momento en lo que más suena hoy. Prueba otro."}
        </Empty>
      ) : (
        <div className="grid grid-cols-2 gap-x-3 gap-y-6 px-5 pt-6">
          {shown.map((a) => (
            <Tile
              key={a.catalogItemId}
              work={a}
              onOpen={props.onOpen}
              meta={<span className="truncate">{[a.byline, a.year].filter(Boolean).join(" · ")}</span>}
            />
          ))}
        </div>
      )}
    </Frame>
  );
}

/** 2c · the most anticipated albums on Kura (none of yours), with their date. */
function SoonDiscs({
  items,
  now,
  onOpen,
}: {
  items: UpcomingItem[];
  now: number;
  onOpen: (w: SeenWork) => void;
}) {
  return (
    <section className="flex flex-col gap-3.5 pt-10">
      <div className="flex items-baseline justify-between gap-3 px-5">
        <h2 className="font-display text-[22px] leading-[1.1] text-text">próximos álbumes</h2>
      </div>
      <div className="bl-scroll flex items-start gap-3 overflow-x-auto px-5">
        {items.map((u) => (
          <Link
            key={u.catalogItemId}
            href={`/item/${u.catalogItemId}`}
            onClick={() => onOpen({ catalogItemId: u.catalogItemId, title: u.title, mediaType: u.mediaType, posterUrl: u.posterUrl })}
            className="flex w-[150px] flex-none flex-col gap-[7px] bl-press-lg"
          >
            <Cover
              posterUrl={u.posterUrl}
              paletteHex={u.paletteHex}
              mediaType={u.mediaType}
              alt={u.title}
              radius="rounded-[14px]"
              wait={releaseLabel(u.releaseDate, now)}
              className="w-full"
            />
            <span className="truncate font-serif text-[15px] italic text-text">{u.title}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- kurada */

const FORMAT_WORD: Record<MediaType, string> = { film: "películas", series: "series", album: "álbumes" };

/**
 * "Colecciones Kuradas · Hechas a mano por nuestros expertos": 300-wide tinted
 * cards that snap sideways — the fan, the name, and the signature (the k seal
 * on glass — NOT honey: a seal per card would repeat the screen's one accent —
 * the curator and the format, the count in mono). A card opens the
 * collection's public page.
 */
function Kuradas({ cards, format }: { cards: KuradaCard[]; format: MediaType }) {
  const square = format === "album";
  if (cards.length === 0) return null;
  return (
    <section className="flex flex-col gap-3.5 pt-11">
      <div className="flex flex-col gap-1.5 px-5">
        <h2 className="font-display text-[22px] leading-[1.1] text-text">Colecciones Kuradas</h2>
        <p className="m-0 text-[15px] leading-[1.4] text-text-2">Hechas a mano por nuestros expertos</p>
      </div>
      <div className="bl-scroll flex snap-x snap-mandatory scroll-px-3 gap-2 overflow-x-auto px-3">
        {cards.map((k) => (
          <Link
            key={k.id}
            href={`/u/${k.username}/${k.id}`}
            className="flex w-[300px] max-w-[calc(100%-36px)] flex-none snap-start flex-col gap-3.5 rounded-[26px] px-[18px] pb-5 pt-[18px] bl-press-lg"
            style={{ background: tintCard(k.hexes) }}
          >
            <span className="flex h-[150px] items-center justify-center">
              <Fan covers={k.fan} lead={square ? 118 : 140} label={`Portadas de ${k.name}`} />
            </span>
            <span className="line-clamp-2 font-display text-[24px] leading-[1.1] text-text text-balance">{k.name}</span>
            <span className="flex items-center gap-2">
              <span
                aria-hidden
                className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full bg-white/[0.16] font-serif text-[15px] font-medium italic leading-none text-text"
              >
                k
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-text-2">
                {k.curator} · {FORMAT_WORD[format]}
              </span>
              <span className="flex-none font-mono text-[10px] uppercase tracking-[0.08em] text-text-2">
                {k.count} {k.count === 1 ? "título" : "títulos"}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

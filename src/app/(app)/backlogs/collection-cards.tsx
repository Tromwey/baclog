"use client";

import type { BacklogVisibility } from "@/modules/backlog/visibility";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { setBacklogPinnedAction } from "@/app/actions/backlog-actions";
import { Sheet, useSheetDismiss } from "@/components/ui";
import { CHIP_44 } from "@/components/kura/components";
import { Fan } from "@/components/kura/fan";
import { KIcon } from "@/components/kura/icons";
import { Masonry, type MasonryItem } from "@/components/kura/masonry";
import { glyphFor, subFor } from "@/components/kura/masonry-data";
import { MenuRow } from "@/components/kura/sheet-parts";
import { useHold } from "@/components/kura/use-hold";
import { feedSurface, feedTail, releaseLabel, tintEnds } from "@/components/kura/tint";
import { ThemeColorSync } from "@/components/theme-color-sync";
import { fanHexes, ownCreditLine, type FanCover } from "@/modules/backlog/fan";
import { visibilityOf } from "@/modules/backlog/visibility";
import type { Shelf } from "@/modules/backlog/shelves";
import type { UpcomingItem } from "@/components/upcoming-shelf";
import { NewBacklogTrigger } from "./new-backlog-button";
import { RenameBody, ShareBody, kindMeta } from "./collection-forms";
import { setZoomOrigin } from "./zoom-origin";

/**
 * Tus colecciones (Colecciones formalizado · 1a, 2026-09-27 — replaces the
 * format filter and the spine cards). One collection at a time:
 *
 *  - its FAN (three covers, no box) in a carousel: swipe it, scroll sideways
 *    with a trackpad, or tap a neighbour's name. Only the current fan is
 *    drawn — the others slide and fade — so nothing half-shows at the edges
 *    except the NAMES: the current one centred in Newsreader 30, the previous
 *    and next pinned 142 px off-centre at 22, dimmed, so it reads that there
 *    is more on either side;
 *  - its line (Newsreader italic) and "N títulos · solo tú / tú y mo";
 *  - its titles in three columns (Masonry), in the manual order;
 *  - the whole page in the feed gradient of its front cover, continuing in
 *    its bottom tone under the dock.
 *
 * The pinned collection comes first (the server orders it), the automatic
 * "no puedo esperar" last. Compartir (glass, next to Nueva colección) shares
 * the collection in the centre. Tapping the fan opens it; holding it opens
 * the s2 sheet: Agregar títulos · Compartir · Fijar · Renombrar.
 */

type Entry =
  | { kind: "shelf"; id: string; name: string; shelf: Shelf; fan: FanCover[]; hexes: string[] }
  | { kind: "auto"; id: string; name: string; items: UpcomingItem[]; fan: FanCover[]; hexes: string[] };

const AUTO_ID = "no-puedo-esperar";
const REMEMBER = "kura:carousel";

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

function remembered(): string | null {
  try {
    return window.sessionStorage.getItem(REMEMBER);
  } catch {
    return null;
  }
}

export function CollectionCards({
  shelves,
  upcoming,
  now,
  username,
  profilePublic,
  coach,
}: {
  shelves: Shelf[];
  upcoming: UpcomingItem[];
  /** The render instant every wait is measured from. */
  now: number;
  username: string | null;
  profilePublic: boolean;
  /** First-run note under the titles (page.tsx decides). */
  coach?: React.ReactNode;
}) {
  const entries: Entry[] = shelves.map((s) => ({
    kind: "shelf",
    id: s.id,
    name: s.name,
    shelf: s,
    fan: s.fan,
    hexes: s.hexes,
  }));
  if (upcoming.length > 0) {
    // Soonest first; the fan leads with the soonest.
    const fan = upcoming.slice(0, 3);
    entries.push({ kind: "auto", id: AUTO_ID, name: "no puedo esperar", items: upcoming, fan, hexes: fanHexes(fan, upcoming) });
  }

  // The current collection is tracked by id, so a pin (which reorders the
  // list on refresh) keeps you on the one you were looking at.
  const [curId, setCurId] = useState<string | null>(null);
  useEffect(() => {
    const id = remembered();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restore once from sessionStorage after hydration
    if (id) setCurId(id);
  }, []);
  const found = entries.findIndex((e) => e.id === curId);
  const idx = found >= 0 ? found : 0;
  const cur = entries[idx];

  const go = (i: number) => {
    const next = entries[Math.max(0, Math.min(entries.length - 1, i))];
    setCurId(next.id);
    try {
      window.sessionStorage.setItem(REMEMBER, next.id);
    } catch {
      // private mode: the carousel just starts at the first one next time
    }
  };

  const [sheet, setSheet] = useState<{ step: "menu" | "share" | "rename"; shelf: Shelf } | null>(null);
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);

  // Swipe: a horizontal drag of 30 px moves one; the click that ends a swipe
  // doesn't open anything.
  const startX = useRef<number | null>(null);
  const swiped = useRef(false);
  const lastWheel = useRef(0);
  const onPointerDown = (e: React.PointerEvent) => {
    startX.current = e.clientX;
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (startX.current === null) return;
    const dx = e.clientX - startX.current;
    startX.current = null;
    if (Math.abs(dx) > 30) {
      swiped.current = true;
      setTimeout(() => (swiped.current = false), 0);
      go(idx + (dx < 0 ? 1 : -1));
    }
  };
  const onWheel = (e: React.WheelEvent) => {
    if (Math.abs(e.deltaX) < Math.abs(e.deltaY) || Math.abs(e.deltaX) < 8) return;
    const t = e.timeStamp;
    if (t - lastWheel.current < 450) return;
    lastWheel.current = t;
    go(idx + (e.deltaX > 0 ? 1 : -1));
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") go(idx + 1);
    else if (e.key === "ArrowLeft") go(idx - 1);
  };

  const tail = feedTail(cur.hexes);

  return (
    <main
      className="relative mx-auto min-h-dvh w-full max-w-md overflow-x-clip pb-dock-clearance text-text"
      style={{ background: feedSurface(cur.hexes, 760), backgroundColor: tail }}
    >
      <ThemeColorSync color={cur.hexes.length ? tintEnds(cur.hexes)[0] : undefined} exact />

      <header className="flex items-end justify-between gap-3.5 px-5 pb-[18px] pt-[max(64px,calc(20px+env(safe-area-inset-top)))]">
        <h1 className="font-brand text-[36px] font-normal leading-[1.02]">tus colecciones</h1>
        <div className="flex gap-2">
          {cur.kind === "shelf" && (
            <button
              type="button"
              aria-label={`Compartir ${cur.name}`}
              onClick={() => setSheet({ step: "share", shelf: cur.shelf })}
              className={CHIP_44}
            >
              <KIcon name="share" size={18} />
            </button>
          )}
          <NewBacklogTrigger ariaLabel="Nueva colección" className={CHIP_44}>
            <KIcon name="plus" size={18} />
          </NewBacklogTrigger>
        </div>
      </header>

      {/* 35c — offline: what's on screen is what was loaded; say so plainly. */}
      {!online && (
        <div
          role="status"
          className="mx-3 mb-4 flex min-h-11 items-center gap-2.5 rounded-[var(--r-surface)] bg-surface-1 px-4"
        >
          <KIcon name="wifiOff" size={16} className="text-text" />
          <span className="flex-1 font-sans text-[14px] text-text-2">
            Sin conexión. Ves lo que ya estaba cargado.
          </span>
        </div>
      )}

      <section
        role="group"
        aria-roledescription="carrusel"
        aria-label="Tus colecciones"
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="outline-none"
      >
        <div
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => (startX.current = null)}
          onWheel={onWheel}
          className="relative h-[290px] cursor-grab touch-pan-y select-none"
        >
          {entries.map((e, i) => {
            const d = i - idx;
            if (Math.abs(d) > 1) return null;
            return (
              <FanSlide
                key={e.id}
                entry={e}
                current={d === 0}
                style={{
                  transform: `translateX(${d * 320}px) scale(${d === 0 ? 1 : 0.92})`,
                  opacity: d === 0 ? 1 : 0,
                }}
                swiped={swiped}
                onHold={e.kind === "shelf" ? () => setSheet({ step: "menu", shelf: e.shelf }) : undefined}
              />
            );
          })}
        </div>

        <div
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          className="relative mt-1 h-11 overflow-hidden touch-pan-y"
        >
          {entries.map((e, i) => {
            const d = i - idx;
            if (Math.abs(d) > 2) return null;
            const transform =
              d === 0
                ? "translateX(-50%)"
                : d === 1
                  ? "translateX(142px)"
                  : d === -1
                    ? "translateX(calc(-100% - 142px))"
                    : d > 1
                      ? "translateX(420px)"
                      : "translateX(calc(-100% - 420px))";
            const style = {
              transform,
              fontSize: d === 0 ? 30 : 22,
              opacity: d === 0 ? 1 : Math.abs(d) === 1 ? 0.35 : 0,
            };
            const cls =
              "absolute left-1/2 top-0 whitespace-nowrap font-brand leading-[44px] transition-[transform,opacity,font-size] duration-[450ms] ease-[cubic-bezier(.16,1,.3,1)] motion-reduce:transition-none";
            return d === 0 ? (
              <h2 key={e.id} aria-live="polite" className={`${cls} font-normal`} style={style}>
                {e.name}
              </h2>
            ) : (
              <button
                key={e.id}
                type="button"
                tabIndex={Math.abs(d) === 1 ? 0 : -1}
                aria-hidden={Math.abs(d) > 1}
                aria-label={`Ir a ${e.name}`}
                onClick={() => !swiped.current && go(i)}
                className={cls}
                style={style}
              >
                {e.name}
              </button>
            );
          })}
        </div>
      </section>

      <Meta entry={cur} now={now} />

      <Titles entry={cur} now={now} />

      {coach}

      {/* The dock floats over the page's own bottom tone, not over black. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 bottom-0 h-[150px]"
        style={{ background: `linear-gradient(transparent, ${tail} 75%)` }}
      />

      {sheet && (
        <Sheet
          onClose={() => setSheet(null)}
          label={sheet.step === "share" ? `Compartir ${sheet.shelf.name}` : sheet.shelf.name}
          pad={sheet.step === "rename" ? "form" : "menu"}
        >
          {sheet.step === "menu" && (
            <HoldMenu shelf={sheet.shelf} onStep={(step) => setSheet({ step, shelf: sheet.shelf })} />
          )}
          {sheet.step === "share" && (
            <ShareBody
              backlogId={sheet.shelf.id}
              name={sheet.shelf.name}
              username={username}
              profilePublic={profilePublic}
              visibility={visibilityOf(sheet.shelf) as BacklogVisibility}
            />
          )}
          {sheet.step === "rename" && (
            <RenameBody backlogId={sheet.shelf.id} name={sheet.shelf.name} vibe={sheet.shelf.vibe} />
          )}
        </Sheet>
      )}
    </main>
  );
}

/* ---------------------------------------------------------------- the fan */

function FanSlide({
  entry,
  current,
  style,
  swiped,
  onHold,
}: {
  entry: Entry;
  current: boolean;
  style: React.CSSProperties;
  swiped: React.RefObject<boolean>;
  onHold?: () => void;
}) {
  const { handlers } = useHold(onHold ?? (() => {}));
  const empty = entry.fan.length === 0;
  const href =
    entry.kind === "auto"
      ? "/backlogs/lentes/no-puedo-esperar"
      : empty
        ? `/descubrir?buscar=1&to=${entry.id}`
        : `/backlogs/${entry.id}`;
  return (
    <Link
      href={href}
      tabIndex={current ? 0 : -1}
      aria-hidden={!current}
      aria-label={empty ? `Agregar títulos a ${entry.name}` : `Abrir ${entry.name}`}
      {...(onHold ? handlers : {})}
      onClick={(e) => {
        if (swiped.current) {
          e.preventDefault();
          return;
        }
        setZoomOrigin(e.clientX, e.clientY);
      }}
      draggable={false}
      className={`absolute left-1/2 top-3.5 -ml-[150px] flex w-[300px] justify-center [-webkit-touch-callout:none] transition-[transform,opacity] duration-[450ms] ease-[cubic-bezier(.16,1,.3,1)] motion-reduce:transition-none ${
        current ? "" : "pointer-events-none"
      }`}
      style={style}
    >
      <Fan covers={entry.fan} lead={225} ghost={empty} />
    </Link>
  );
}

/* ------------------------------------------------------------ line + meta */

function Meta({ entry, now }: { entry: Entry; now: number }) {
  let vibe: string | null;
  let meta: string;
  if (entry.kind === "auto") {
    const next = entry.items[0];
    vibe = "se llena sola con lo que aún no sale";
    meta = `${entry.items.length} ${entry.items.length === 1 ? "título" : "títulos"}${
      next ? ` · el próximo ${nextLabel(releaseLabel(next.releaseDate, now))}` : ""
    }`;
  } else {
    const s = entry.shelf;
    vibe = s.vibe;
    meta = `${s.itemCount} ${s.itemCount === 1 ? "título" : "títulos"} · ${ownCreditLine(s.collaborators)}`;
  }
  return (
    <div className="flex flex-col items-center gap-2 px-8 pb-[22px] pt-1 text-center">
      {vibe && (
        <span className="font-brand text-[15px] italic leading-[1.3] text-text-2 [text-wrap:balance]">{vibe}</span>
      )}
      <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">{meta}</span>
    </div>
  );
}

/** "4 d" → "en 4 d" · "17 oct" → "el 17 oct" · "hoy" stays. */
export function nextLabel(label: string): string {
  if (label === "hoy") return "hoy";
  return /^\d+ [hd]$/.test(label) ? `en ${label}` : `el ${label}`;
}

/* ----------------------------------------------------------------- titles */

function Titles({ entry, now }: { entry: Entry; now: number }) {
  if (entry.kind === "auto") {
    const items: MasonryItem[] = entry.items.map((u) => ({
      key: u.catalogItemId,
      href: `/item/${u.catalogItemId}`,
      title: u.title,
      mediaType: u.mediaType,
      posterUrl: u.posterUrl,
      paletteHex: u.paletteHex ?? null,
      glyph: null,
      wait: releaseLabel(u.releaseDate, now),
      sub: subFor({ year: null, mediaType: u.mediaType }),
    }));
    return <Masonry items={items} />;
  }

  const s = entry.shelf;
  if (s.itemCount === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-8 text-center">
        <p className="font-sans text-[15px] leading-[1.5] text-text-2">
          Empieza por lo que no puedes dejar de recomendar.
        </p>
        <Link
          href={`/descubrir?buscar=1&to=${s.id}`}
          className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[var(--glass-bg)] pl-[18px] pr-[22px] font-sans text-[16px] font-semibold text-text bl-press"
        >
          <KIcon name="plus" size={18} />
          Agregar títulos
        </Link>
      </div>
    );
  }
  const items: MasonryItem[] = s.covers.map((c) => ({
    key: c.backlogItemId,
    href: `/item/${c.catalogItemId}`,
    title: c.title,
    mediaType: c.mediaType,
    posterUrl: c.posterUrl,
    paletteHex: c.paletteHex,
    glyph: glyphFor(c),
    wait: c.releaseDate && new Date(c.releaseDate).getTime() > now ? releaseLabel(c.releaseDate, now) : null,
    sub: subFor(c),
  }));
  return (
    <>
      <Masonry items={items} />
      {s.itemCount > s.covers.length && (
        <div className="flex justify-center px-5 pt-1">
          <Link
            href={`/backlogs/${s.id}`}
            className="inline-flex h-11 items-center rounded-full bg-[var(--glass-bg)] px-4 font-sans text-[15px] font-semibold text-text bl-press hover:bg-white/[0.12]"
          >
            Ver los {s.itemCount} títulos
          </Link>
        </div>
      )}
    </>
  );
}

/* -------------------------------------------------------------- hold sheet */

/**
 * Holding a fan (frame 10, sheetOpen): the name 24 + mono meta, then Agregar
 * títulos · Compartir · Fijar/Desfijar · Renombrar. Compartir and Renombrar
 * swap the SAME sheet's content — never two sheets at once.
 */
function HoldMenu({
  shelf,
  onStep,
}: {
  shelf: Shelf;
  onStep: (step: "share" | "rename") => void;
}) {
  const router = useRouter();
  const dismiss = useSheetDismiss();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  function togglePin() {
    setFailed(false);
    startTransition(async () => {
      const res = await setBacklogPinnedAction(shelf.id, !shelf.pinned).catch(() => null);
      if (!res || !("ok" in res)) {
        setFailed(true);
        return;
      }
      router.refresh();
      dismiss?.();
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3 px-2.5 pb-2">
        <span className="min-w-0 truncate font-brand text-[24px] text-text">{shelf.name}</span>
        <span className="flex-none font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">
          {kindMeta(shelf.itemCount, shelf.byKind)}
        </span>
      </div>
      <MenuRow icon="plus" label="Agregar títulos" href={`/descubrir?buscar=1&to=${shelf.id}`} />
      <MenuRow icon="share" label="Compartir" onClick={() => onStep("share")} />
      <MenuRow
        icon="pin"
        label={shelf.pinned ? "Desfijar" : "Fijar"}
        aside={shelf.pinned ? "fijada" : undefined}
        onClick={togglePin}
        disabled={pending}
      />
      <MenuRow icon="pencil" label="Renombrar" onClick={() => onStep("rename")} />
      {failed && (
        <p className="px-2.5 pt-1 font-sans text-[13px] text-text-2">
          No se pudo guardar. Revisa tu conexión e inténtalo otra vez.
        </p>
      )}
    </div>
  );
}

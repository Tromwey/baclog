"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CHIP_ART } from "@/components/kura/components";
import { Fan } from "@/components/kura/fan";
import { DotsIcon, KIcon } from "@/components/kura/icons";
import { useHold } from "@/components/kura/use-hold";
import { feedSurface, feedTail, releaseLabel, tintEnds } from "@/components/kura/tint";
import { ThemeColorSync } from "@/components/theme-color-sync";
import { fanHexes, type FanCover } from "@/modules/backlog/fan";
import type { CollectionItem, OtherCollection } from "@/modules/backlog/collection-item";
import { visibilityOf } from "@/modules/backlog/visibility";
import type { Shelf } from "@/modules/backlog/shelves";
import type { UpcomingItem } from "@/components/upcoming-shelf";
import {
  CollectionBody,
  nextLabel,
  type CollectionControls,
} from "./[backlogId]/collection-body";
import { CollectionHoldSheet } from "./collection-hold-sheet";
import { NewBacklogTrigger } from "./new-backlog-button";

/**
 * Tus colecciones (Colecciones · una sola página, 2026-09-27 — design 10a).
 * One collection at a time, and under it the SAME body as the collection
 * (10b): credits, format pills that filter, "el orden" + Reordenar, every
 * title in columns, holding a title (18c), the same Opciones.
 *
 *  - The FANS in a carousel: swipe, scroll sideways with a trackpad, arrow
 *    keys or tap a neighbour's name. Only the current fan is drawn — the
 *    others slide and fade — so only the NAMES peek at the edges (the current
 *    centred at 30, the neighbours 142 px off-centre at 22, dimmed). Tapping
 *    the fan does NOT open anything (founder): it only sits in the centre;
 *    HOLDING it opens 9a (Agregar · Compartir · Fijar · Renombrar ·
 *    Privacidad · Borrar colección).
 *  - The order: the pinned one, the rest (server order), the empty ones,
 *    "no puedo esperar" PENULTIMATE (founder) and LAST the ghost fan "Nueva
 *    colección" — which is where creating a collection lives now.
 *  - The header's Compartir + Opciones (glass 44) act on the collection in
 *    the centre; over the ghost they fade out. "no puedo esperar" can't be
 *    shared, so it keeps only Opciones (Ver como lista).
 *  - An empty collection shows 6b and keeps Compartir and Opciones; it never
 *    sends you to Descubrir.
 *  - The whole page wears the feed gradient of the current fan, continuing
 *    in its bottom tone under the dock.
 *
 * The current collection is remembered by id (sessionStorage), so a pin —
 * which reorders the list on refresh — keeps you on the one you were on.
 */

type Entry =
  | { kind: "shelf"; id: string; name: string; shelf: Shelf; fan: FanCover[]; hexes: string[] }
  | { kind: "auto"; id: string; name: string; items: UpcomingItem[]; fan: FanCover[]; hexes: string[] }
  | { kind: "ghost"; id: string; name: string; fan: FanCover[]; hexes: string[] };

const AUTO_ID = "no-puedo-esperar";
const GHOST_ID = "nueva-coleccion";
const REMEMBER = "kura:carousel";
/** The toast floats above the dock here (Descubrir's offset). */
const TOAST_BOTTOM = "calc(var(--dock-clearance) - 22px)";

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
  owner,
  username,
  profilePublic,
  coach,
}: {
  shelves: Shelf[];
  upcoming: UpcomingItem[];
  /** The render instant every wait is measured from. */
  now: number;
  /** The seal in the credits. */
  owner: { name: string; image: string | null; hexes: string[] };
  username: string | null;
  profilePublic: boolean;
  /** First-run note under the titles (page.tsx decides). */
  coach?: React.ReactNode;
}) {
  const entries = useMemo(() => {
    const shelf = (s: Shelf): Entry => ({ kind: "shelf", id: s.id, name: s.name, shelf: s, fan: s.fan, hexes: s.hexes });
    const pinned = shelves.filter((s) => s.pinned);
    const full = shelves.filter((s) => !s.pinned && s.itemCount > 0);
    const empties = shelves.filter((s) => !s.pinned && s.itemCount === 0);
    const out: Entry[] = [...pinned, ...full, ...empties].map(shelf);
    if (upcoming.length > 0) {
      // Soonest first; the fan leads with the soonest.
      const fan = upcoming.slice(0, 3);
      out.push({ kind: "auto", id: AUTO_ID, name: "no puedo esperar", items: upcoming, fan, hexes: fanHexes(fan, upcoming) });
    }
    out.push({ kind: "ghost", id: GHOST_ID, name: "nueva colección", fan: [], hexes: [] });
    return out;
  }, [shelves, upcoming]);

  // Mover a (7a): the other collections with their fan, and where every
  // title already lives (a move never duplicates; its undo never removes a
  // membership that existed before). Everything is already here.
  const memberships = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const s of shelves) for (const it of s.items) (m[it.catalogItemId] ??= []).push(s.id);
    return m;
  }, [shelves]);

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

  const ctl = useRef<CollectionControls>(null);
  const [holding, setHolding] = useState<Shelf | null>(null);
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);

  // Swipe: a horizontal drag of 30 px moves one.
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
  const ghost = cur.kind === "ghost";

  return (
    <main
      className="relative mx-auto min-h-dvh w-full max-w-md overflow-x-clip pb-dock-clearance text-text"
      style={{ background: feedSurface(cur.hexes, 760), backgroundColor: tail }}
    >
      <ThemeColorSync color={cur.hexes.length ? tintEnds(cur.hexes)[0] : undefined} exact />

      <header className="flex items-end justify-between gap-3.5 px-5 pb-[18px] pt-[max(64px,calc(20px+env(safe-area-inset-top)))]">
        <h1 className="font-brand text-[36px] font-normal leading-[1.02]">tus colecciones</h1>
        <div
          aria-hidden={ghost}
          className={`flex gap-2 transition-opacity duration-300 motion-reduce:transition-none ${
            ghost ? "pointer-events-none opacity-0" : ""
          }`}
        >
          {cur.kind === "shelf" && (
            <button
              type="button"
              tabIndex={ghost ? -1 : 0}
              aria-label={`Compartir ${cur.name}`}
              onClick={() => ctl.current?.open("share")}
              className={CHIP_ART}
            >
              <KIcon name="share" size={18} />
            </button>
          )}
          <button
            type="button"
            tabIndex={ghost ? -1 : 0}
            aria-label={`Opciones de ${cur.name}`}
            onClick={() => ctl.current?.open("options")}
            className={CHIP_ART}
          >
            <DotsIcon />
          </button>
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
                onHold={e.kind === "shelf" ? () => setHolding(e.shelf) : undefined}
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
              opacity: d === 0 ? (e.kind === "ghost" ? 0.6 : 1) : Math.abs(d) === 1 ? 0.35 : 0,
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

      {cur.kind === "shelf" && (
        <CollectionBody
          key={cur.id}
          ref={ctl}
          mode="owned"
          backlog={{
            id: cur.shelf.id,
            name: cur.shelf.name,
            vibe: cur.shelf.vibe,
            visibility: visibilityOf(cur.shelf),
            pinned: cur.shelf.pinned,
            coverCatalogItemId: cur.shelf.coverCatalogItemId,
          }}
          items={cur.shelf.items}
          now={now}
          others={othersOf(shelves, cur.shelf.id)}
          memberships={memberships}
          owner={owner}
          collaborators={cur.shelf.collaborators}
          username={username}
          profilePublic={profilePublic}
          introClassName="pt-1"
          toastBottom={TOAST_BOTTOM}
        />
      )}

      {cur.kind === "auto" && (
        <>
          <AutoMeta items={cur.items} now={now} />
          <CollectionBody
            key={cur.id}
            ref={ctl}
            mode="auto"
            backlog={{ id: AUTO_ID, name: cur.name, vibe: null, visibility: "private" }}
            items={cur.items.map((u) => autoItem(u))}
            now={now}
            toastBottom={TOAST_BOTTOM}
          />
        </>
      )}

      {cur.kind === "ghost" && <GhostBody />}

      {coach}

      {/* The dock floats over the page's own bottom tone, not over black. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 bottom-0 h-[150px]"
        style={{ background: `linear-gradient(transparent, ${tail} 75%)` }}
      />

      {holding && (
        <CollectionHoldSheet
          collection={{
            id: holding.id,
            name: holding.name,
            vibe: holding.vibe,
            count: holding.itemCount,
            pinned: holding.pinned,
            visibility: visibilityOf(holding),
          }}
          username={username}
          profilePublic={profilePublic}
          onClose={() => setHolding(null)}
        />
      )}
    </main>
  );
}

function othersOf(shelves: readonly Shelf[], currentId: string): OtherCollection[] {
  return shelves
    .filter((s) => s.id !== currentId)
    .map((s) => ({ id: s.id, name: s.name, fan: s.fan, count: s.itemCount }));
}

/** A title of "no puedo esperar" in the body's shape (as its own page does). */
function autoItem(u: UpcomingItem): CollectionItem {
  return {
    backlogItemId: u.catalogItemId,
    catalogItemId: u.catalogItemId,
    title: u.title,
    byline: null,
    mediaType: u.mediaType,
    year: null,
    posterUrl: u.posterUrl,
    paletteHex: u.paletteHex ? [...u.paletteHex] : null,
    status: "on_my_radar",
    verdict: null,
    obsessed: false,
    releaseDate: u.releaseDate,
    addedAt: u.releaseDate,
  };
}

/* ---------------------------------------------------------------- the fan */

/**
 * The fan in the centre. Tapping it does nothing more than being in the
 * centre (founder, 2026-09-27 — it no longer opens the collection: the
 * collection is right below); holding a real collection's fan opens 9a.
 */
function FanSlide({
  entry,
  current,
  style,
  onHold,
}: {
  entry: Entry;
  current: boolean;
  style: React.CSSProperties;
  onHold?: () => void;
}) {
  const { handlers } = useHold(onHold ?? (() => {}));
  return (
    <div
      aria-hidden={!current}
      {...(onHold && current ? handlers : {})}
      className={`absolute left-1/2 top-3.5 -ml-[150px] flex w-[300px] select-none justify-center [-webkit-touch-callout:none] transition-[transform,opacity] duration-[450ms] ease-[cubic-bezier(.16,1,.3,1)] motion-reduce:transition-none ${
        current ? "" : "pointer-events-none"
      }`}
      style={style}
    >
      <Fan
        covers={entry.fan}
        lead={225}
        ghost={entry.fan.length === 0}
        label={entry.kind === "ghost" ? undefined : `Portadas de ${entry.name}`}
      />
    </div>
  );
}

/* ------------------------------------------------------------- auto meta */

/** "no puedo esperar" keeps its own line: it has no credits and no order. */
function AutoMeta({ items, now }: { items: UpcomingItem[]; now: number }) {
  const next = items[0];
  const meta = `${items.length} ${items.length === 1 ? "título" : "títulos"}${
    next ? ` · el próximo ${nextLabel(releaseLabel(next.releaseDate, now))}` : ""
  }`;
  return (
    <div className="flex flex-col items-center gap-2.5 px-6 pb-[26px] pt-1 text-center">
      <span className="font-brand text-[16px] italic leading-[1.3] text-text-2 [text-wrap:balance]">
        se llena sola con lo que aún no sale
      </span>
      <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">{meta}</span>
    </div>
  );
}

/* ---------------------------------------------------------------- ghost */

/**
 * The last fan (10a): the ghost "Nueva colección" — its phrase and the glass
 * button that opens the existing create flow (O2a).
 */
function GhostBody() {
  return (
    <div className="flex flex-col items-center gap-3 px-8 pt-2 text-center">
      <p className="font-sans text-[15px] leading-[1.5] text-text-2 [text-wrap:pretty]">
        Empieza por lo que no puedes dejar de recomendar. Una colección puede mezclar cine, series y
        música.
      </p>
      <NewBacklogTrigger className="mt-1.5 flex h-11 items-center gap-2 rounded-full bg-[var(--glass-bg)] pl-3 pr-4 font-sans text-[15px] font-semibold text-text bl-press">
        <KIcon name="plus" size={18} />
        Nueva colección
      </NewBacklogTrigger>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CHIP_ART } from "@/components/kura/components";
import { Fan } from "@/components/kura/fan";
import { DotsIcon, KIcon } from "@/components/kura/icons";
import { useHold } from "@/components/kura/use-hold";
import { releaseLabel, tintEnds } from "@/components/kura/tint";
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
import {
  backgroundAt,
  bodyStyle,
  fanStyle,
  nameStyle,
  useCarouselMotion,
} from "./carousel-motion";
import { CollectionHoldSheet } from "./collection-hold-sheet";
import { NewBacklogTrigger } from "./new-backlog-button";

/**
 * Tus colecciones (Colecciones · una sola página, 2026-09-27 — design 10a).
 * One collection at a time, and under it the SAME body as the collection
 * (10b): credits, format pills that filter, every title in columns, holding
 * a title (18c), the same Opciones (Reordenar lives there).
 *
 *  - The FANS in a carousel: drag (1:1, see `carousel-motion.ts`), scroll
 *    sideways with a trackpad, arrow keys, tap an edge or a neighbour's name.
 *    Only the current fan is drawn — the others slide and fade — so only the
 *    NAMES peek at the edges (the current centred at 30, the neighbours
 *    142 px off-centre at 22, dimmed). Tapping
 *    the fan does NOT open anything (founder): it only sits in the centre;
 *    HOLDING it opens 9a (Agregar · Compartir · Fijar · Renombrar ·
 *    Privacidad · Borrar colección).
 *  - The order: FIRST the ghost fan "Nueva colección" (founder, 2026-09-27:
 *    to the left of the first collection) — which is where creating a
 *    collection lives now —, then the pinned one, the rest (server order),
 *    the empty ones and "no puedo esperar" LAST. It OPENS on the first real
 *    collection (index 1), never on the ghost, whose dimmed name peeks left.
 *  - The header's Compartir + Opciones (glass 44) act on the collection in
 *    the centre; over the ghost they fade out. "no puedo esperar" can't be
 *    shared, so it keeps only Opciones (Ver como lista).
 *  - An empty collection shows 6b and keeps Compartir and Opciones; it never
 *    sends you to Descubrir.
 *  - The whole page wears the feed gradient of the current fan, continuing
 *    in its bottom tone under the dock.
 *
 * The current collection is remembered by id (sessionStorage), so a pin —
 * which reorders the list on refresh — keeps you on the one you were on. A
 * remembered ghost, or an id that no longer exists, starts on index 1.
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
  // A Guardar orden in the body repaints its collection's fan and gradient
  // before the server answers (the new #1 leads). Holds only while `shelves`
  // is the array it was made against: the refresh after the write replaces it.
  const [curated, setCurated] = useState<{
    base: Shelf[];
    id: string;
    fan: FanCover[];
    hexes: string[];
  } | null>(null);
  const live = curated && curated.base === shelves ? curated : null;

  const entries = useMemo(() => {
    const shelf = (s: Shelf): Entry =>
      live && live.id === s.id
        ? { kind: "shelf", id: s.id, name: s.name, shelf: s, fan: live.fan, hexes: live.hexes }
        : { kind: "shelf", id: s.id, name: s.name, shelf: s, fan: s.fan, hexes: s.hexes };
    const pinned = shelves.filter((s) => s.pinned);
    const full = shelves.filter((s) => !s.pinned && s.itemCount > 0);
    const empties = shelves.filter((s) => !s.pinned && s.itemCount === 0);
    const out: Entry[] = [
      { kind: "ghost", id: GHOST_ID, name: "nueva colección", fan: [], hexes: [] },
      ...[...pinned, ...full, ...empties].map(shelf),
    ];
    if (upcoming.length > 0) {
      // Soonest first; the fan leads with the soonest.
      const fan = upcoming.slice(0, 3);
      out.push({ kind: "auto", id: AUTO_ID, name: "no puedo esperar", items: upcoming, fan, hexes: fanHexes(fan, upcoming) });
    }
    return out;
  }, [shelves, upcoming, live]);

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
    // Opening Tus colecciones never lands on the ghost: a remembered "nueva
    // colección" starts on the first collection like a fresh visit.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restore once from sessionStorage after hydration
    if (id && id !== GHOST_ID) setCurId(id);
  }, []);
  // Nothing remembered (SSR, first visit) or it's gone → the first REAL
  // collection, index 1 (the page only mounts this with ≥ 1 collection). The
  // SSR frame is already there, and a restored id lands by `set` — no spring.
  const found = entries.findIndex((e) => e.id === curId);
  const idx = found >= 0 ? found : Math.min(1, entries.length - 1);
  const cur = entries[idx];

  const ctl = useRef<CollectionControls>(null);
  const [holding, setHolding] = useState<Shelf | null>(null);
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);

  const { go, reduced, handlers, swiped, bindSurface, bindMain, bindBg, bindBody, bindTail } = useCarouselMotion(entries, idx, (i) => {
    const next = entries[i];
    setCurId(next.id);
    try {
      window.sessionStorage.setItem(REMEMBER, next.id);
    } catch {
      // private mode: the carousel just starts at the first collection next time
    }
  });
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") go(idx + 1);
    else if (e.key === "ArrowLeft") go(idx - 1);
  };

  const ghost = cur.kind === "ghost";
  // Render at the resting position; the carousel's layout effect writes the
  // live one (mid-drag, mid-spring) over it before paint.
  const p = idx;
  const bg = backgroundAt(entries, p);

  return (
    <main
      ref={bindMain}
      className="relative isolate mx-auto min-h-dvh w-full max-w-md overflow-x-clip pb-dock-clearance text-text"
      style={{ background: bg.a, backgroundColor: bg.tail }}
    >
      {/* The neighbour's gradient, crossed in by the carousel's position. */}
      <div
        ref={bindBg}
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{ background: bg.b, opacity: bg.t }}
      />
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
        {/* ONE drag surface for the fans and the names: both follow the same
            continuous position, 1:1 with the finger. */}
        <div
          ref={bindSurface}
          {...handlers}
          className="relative h-[334px] cursor-grab touch-pan-y select-none active:cursor-grabbing"
        >
          {entries.map((e, i) => {
            if (Math.abs(i - idx) > 2) return null;
            return (
              <FanSlide
                key={e.id}
                entry={e}
                current={i === idx}
                index={i}
                style={fanStyle(i, p)}
                onHold={e.kind === "shelf" ? () => setHolding(e.shelf) : undefined}
              />
            );
          })}

          <div className="absolute inset-x-0 top-[290px] h-11 overflow-hidden">
            {entries.map((e, i) => {
              const d = i - idx;
              if (Math.abs(d) > 3) return null;
              const cls = "absolute left-1/2 top-0 whitespace-nowrap font-brand leading-[44px]";
              const style = nameStyle(i, p, e.kind === "ghost");
              return d === 0 ? (
                <h2 key={e.id} data-carousel-name={i} aria-live="polite" className={`${cls} font-normal`} style={style}>
                  {e.name}
                </h2>
              ) : (
                <button
                  key={e.id}
                  data-carousel-name={i}
                  type="button"
                  tabIndex={Math.abs(d) === 1 ? 0 : -1}
                  aria-hidden={Math.abs(d) > 1}
                  aria-label={`Ir a ${e.name}`}
                  onClick={() => !swiped() && go(i)}
                  className={cls}
                  style={style}
                >
                  {e.name}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* The body leaves at half the travel and the next one comes in 24 px
          from the other side (the wrapper follows the position too). */}
      <div ref={bindBody} style={bodyStyle(p, entries.length, reduced)}>
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
            onFanChange={(next) => {
              const id = cur.shelf.id;
              setCurated(next ? { base: shelves, id, ...next } : null);
            }}
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
      </div>

      {coach}

      {/* The dock floats over the page's own bottom tone, not over black. */}
      <div
        ref={bindTail}
        aria-hidden
        className="pointer-events-none fixed inset-x-0 bottom-0 h-[150px]"
        style={{ background: `linear-gradient(transparent, ${bg.tail} 75%)` }}
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
  index,
  onHold,
}: {
  entry: Entry;
  current: boolean;
  style: React.CSSProperties;
  index: number;
  onHold?: () => void;
}) {
  const { handlers } = useHold(onHold ?? (() => {}));
  return (
    <div
      data-carousel-fan={index}
      aria-hidden={!current}
      {...(onHold && current ? handlers : {})}
      className={`absolute left-1/2 top-3.5 -ml-[150px] flex w-[300px] select-none justify-center [-webkit-touch-callout:none] ${
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
 * The first fan (10a): the ghost "Nueva colección" — its phrase and the glass
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

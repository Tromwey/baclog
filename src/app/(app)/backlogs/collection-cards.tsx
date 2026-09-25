"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import type { BacklogVisibility } from "@/app/actions/backlog-actions";
import { Sheet } from "@/components/ui";
import { Glyph } from "@/components/kura/components";
import { KIcon } from "@/components/kura/icons";
import { MenuRow } from "@/components/kura/sheet-parts";
import { useHold } from "@/components/kura/use-hold";
import { releaseLabel, tintCard } from "@/components/kura/tint";
import { posterFallbackStyle } from "@/components/cover-tile";
import { visibilityOf } from "@/modules/backlog/visibility";
import type { Shelf, ShelfCover } from "@/modules/backlog/shelves";
import type { MediaType } from "@/modules/catalog/types";
import type { UpcomingItem } from "@/components/upcoming-shelf";
import { RenameBody, ShareBody, kindMeta } from "./collection-forms";
import { setZoomOrigin } from "./zoom-origin";

/**
 * Tus colecciones (flujos-v2 · 02 · "Colecciones", 2026-09-24): the mono
 * format filter, the AUTOMATIC collection "no puedo esperar" (spine, 150
 * covers each wearing how long is left, the "auto" pill) and then every
 * collection as a card — a 40 px spine with the name set vertically, the
 * covers at ONE height aligned to the base (the width follows the format),
 * over a surface tinted by its newest cover. Each card slides sideways when
 * its covers overflow.
 *
 * Holding a card (450 ms, or the context menu) lifts it and opens the s2
 * sheet: Agregar títulos · Compartir · Renombrar. The frame's first row,
 * "Fijar", is OMITTED: the product persists no pin, so every card is the
 * compact one (120 covers, no state glyphs — the frame's unpinned card).
 */

type Kind = "all" | MediaType;

const KINDS: { key: Kind; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "film", label: "Cine" },
  { key: "series", label: "Series" },
  { key: "album", label: "Música" },
];

const EMPTY_KIND: Record<MediaType, string> = {
  film: "Sin cine en tus colecciones.",
  series: "Sin series en tus colecciones.",
  album: "Sin música en tus colecciones.",
};

/** A card shows this many covers at most (they slide); newest first. */
const STRIP_MAX = 12;

/** Width of a cover at `h` in its native format (§forma: disco 1:1, póster 2:3). */
export function coverWidth(mediaType: MediaType, h: number): number {
  return mediaType === "album" ? h : Math.round((h * 2) / 3);
}

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export function CollectionCards({
  shelves,
  upcoming,
  now,
  username,
  profilePublic,
}: {
  shelves: Shelf[];
  upcoming: UpcomingItem[];
  /** The render instant every wait is measured from. */
  now: number;
  username: string | null;
  profilePublic: boolean;
}) {
  const [kind, setKind] = useState<Kind>("all");
  const [held, setHeld] = useState<Shelf | null>(null);
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );

  const visibleUpcoming =
    kind === "all" ? upcoming : upcoming.filter((u) => u.mediaType === kind);

  const visible = shelves.flatMap((s) => {
    if (kind !== "all" && s.byKind[kind].total === 0) return [];
    const covers = (
      kind === "all" ? s.covers : s.covers.filter((c) => c.mediaType === kind)
    ).slice(0, STRIP_MAX);
    return [{ shelf: s, covers }];
  });

  return (
    <>
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

      <div className="px-5 pb-[22px]">
        <div
          role="tablist"
          aria-label="Filtrar por formato"
          className="flex gap-1 rounded-full bg-[var(--glass-bg)] p-[5px]"
        >
          {KINDS.map((k) => {
            const active = k.key === kind;
            return (
              <button
                key={k.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setKind(k.key)}
                className={`flex-1 rounded-full py-2.5 text-center font-mono text-[11px] uppercase tracking-[0.1em] ${
                  active ? "bg-white/[0.1] text-text" : "text-text-2"
                }`}
              >
                {k.label}
              </button>
            );
          })}
        </div>
      </div>

      {visibleUpcoming.length > 0 && <WaitCard items={visibleUpcoming} now={now} />}

      {visible.length === 0 ? (
        <p className="px-5 pt-2 font-mono text-[11px] uppercase tracking-[0.08em] text-text-3">
          {kind === "all" ? "Sin colecciones todavía." : EMPTY_KIND[kind]}
        </p>
      ) : (
        visible.map(({ shelf, covers }) => (
          <CollectionCard
            key={shelf.id}
            shelf={shelf}
            covers={covers}
            now={now}
            lifted={held?.id === shelf.id}
            onHold={() => setHeld(shelf)}
          />
        ))
      )}

      {held && (
        <HoldSheet
          shelf={held}
          username={username}
          profilePublic={profilePublic}
          onClose={() => setHeld(null)}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------ the covers */

/** The wait pill over a cover (§StatusPill · cuadrícula): lavender clock + mono. */
function WaitPill({ label, small = false }: { label: string; small?: boolean }) {
  return (
    <span
      className={`absolute left-1.5 top-1.5 z-[2] inline-flex items-center gap-[5px] rounded-full bg-glass-art font-mono uppercase leading-none text-text backdrop-blur-[14px] ${
        small
          ? "h-6 pl-1.5 pr-2 text-[10px] tracking-[0.04em]"
          : "h-[26px] pl-[7px] pr-[9px] text-[11px] tracking-[0.04em]"
      }`}
    >
      <Glyph kind="waiting" size={small ? 12 : 13} />
      {label}
    </span>
  );
}

function CardCover({
  c,
  h,
  wait,
  small,
}: {
  c: {
    title: string;
    posterUrl: string | null;
    paletteHex?: readonly string[] | null;
    mediaType: MediaType;
  };
  h: number;
  wait: string | null;
  small?: boolean;
}) {
  return (
    <span
      role="img"
      aria-label={wait ? `${c.title}, ${wait}` : c.title}
      className="relative block flex-none overflow-hidden rounded-[var(--r-cover-l)] bg-surface-2 shadow-cover"
      style={{
        height: h,
        width: coverWidth(c.mediaType, h),
        ...(c.posterUrl ? null : posterFallbackStyle(c.paletteHex)),
      }}
    >
      {c.posterUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- hotlinked CDN (ADR-007)
        <img
          src={c.posterUrl}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      {wait && <WaitPill label={wait} small={small} />}
    </span>
  );
}

/* ------------------------------------------------- no puedo esperar (auto) */

/**
 * The automatic collection (K2 folded into the list, flujos-v2 02): every
 * title of the library that hasn't come out, soonest first, as 150 covers
 * with the countdown pill. Tinted by its soonest title. Opens the auto
 * collection's own screen (37b).
 */
function WaitCard({ items, now }: { items: UpcomingItem[]; now: number }) {
  const lead = items.find((i) => i.paletteHex?.length)?.paletteHex ?? [];
  return (
    <div className="bl-scroll mb-3 overflow-x-auto px-3 [scroll-padding:0_12px] [scroll-snap-type:x_proximity]">
      <Link
        href="/backlogs/lentes/no-puedo-esperar"
        aria-label={`no puedo esperar, ${items.length} ${items.length === 1 ? "título" : "títulos"}`}
        className="relative flex w-max min-w-full snap-start overflow-hidden rounded-[var(--r-screen)] bl-press-lg"
        style={{ background: lead.length ? tintCard(lead) : "var(--surface-1)" }}
      >
        <Spine name="no puedo esperar" size={13} max={170} />
        <span className="flex flex-none items-end gap-2.5 px-3.5 pb-[18px] pt-11">
          {items.map((it) => (
            <CardCover
              key={it.catalogItemId}
              c={it}
              h={150}
              wait={releaseLabel(it.releaseDate, now)}
              small
            />
          ))}
          <span className="w-0.5 flex-none" />
        </span>
        <span className="absolute left-14 top-3 rounded-full bg-glass-art px-[9px] py-[5px] font-mono text-[10px] uppercase tracking-[0.08em] text-text-2">
          auto
        </span>
      </Link>
    </div>
  );
}

function Spine({ name, size, max }: { name: string; size: number; max: number }) {
  return (
    <span className="flex w-10 flex-none items-center justify-center bg-black/[0.24]">
      <span
        className="overflow-hidden text-ellipsis whitespace-nowrap font-mono tracking-[0.14em] text-text"
        style={{
          writingMode: "vertical-rl",
          transform: "rotate(180deg)",
          fontSize: size,
          maxHeight: max,
        }}
      >
        {name}
      </span>
    </span>
  );
}

/* -------------------------------------------------------- collection card */

function CollectionCard({
  shelf,
  covers,
  now,
  lifted,
  onHold,
}: {
  shelf: Shelf;
  covers: ShelfCover[];
  now: number;
  lifted: boolean;
  onHold: () => void;
}) {
  const { handlers } = useHold(onHold);
  const lead = covers.find((c) => c.paletteHex?.length)?.paletteHex ?? [];

  return (
    <div className="bl-scroll mb-3 overflow-x-auto px-3 [scroll-padding:0_12px] [scroll-snap-type:x_proximity]">
      <Link
        href={`/backlogs/${shelf.id}`}
        aria-label={`${shelf.name}, ${shelf.itemCount} ${shelf.itemCount === 1 ? "título" : "títulos"}`}
        {...handlers}
        // The detail opens from where it was tapped (zoom-origin.ts).
        onClick={(e) => setZoomOrigin(e.clientX, e.clientY)}
        // Press = bl-press-lg's 0.985 on the `scale` property, which composes
        // with the hold-lift's inline `transform` — spelled out by hand
        // because the lift also transitions `transform` (bl-press-lg would
        // own `transition-property`). Once lifted, the press lets go.
        className={`flex w-max min-w-full snap-start select-none overflow-hidden rounded-[var(--r-screen)] transition-[transform,scale,opacity] duration-[180ms] [-webkit-touch-callout:none] ${
          lifted
            ? ""
            : "active:scale-[0.985] active:duration-[80ms] motion-reduce:active:scale-100 motion-reduce:active:opacity-80"
        }`}
        style={{
          background: covers.length ? tintCard(lead) : "var(--surface-1)",
          transform: lifted ? "scale(1.03)" : undefined,
        }}
      >
        <Spine name={shelf.name} size={11} max={140} />
        <span className="flex flex-none items-end gap-2.5 px-3.5 py-4">
          {covers.length === 0 ? (
            <span className="flex h-[120px] w-20 items-center justify-center rounded-[var(--r-cover-l)] bg-[var(--glass-bg)] font-mono text-[10px] uppercase tracking-[0.08em] text-text-3">
              vacía
            </span>
          ) : (
            covers.map((c) => (
              <CardCover
                key={c.backlogItemId}
                c={c}
                h={120}
                wait={
                  c.releaseDate && new Date(c.releaseDate).getTime() > now
                    ? releaseLabel(c.releaseDate, now)
                    : null
                }
              />
            ))
          )}
          <span className="w-0.5 flex-none" />
        </span>
      </Link>
    </div>
  );
}

/* -------------------------------------------------------------- hold sheet */

/**
 * The card's hold sheet (frame 10, sheetOpen): the name 24 + mono meta, then
 * Agregar títulos · Compartir · Renombrar. Compartir and Renombrar swap the
 * SAME sheet's content — never two sheets at once.
 */
function HoldSheet({
  shelf,
  username,
  profilePublic,
  onClose,
}: {
  shelf: Shelf;
  username: string | null;
  profilePublic: boolean;
  onClose: () => void;
}) {
  const [step, setStep] = useState<"menu" | "share" | "rename">("menu");
  const visibility: BacklogVisibility = visibilityOf(shelf);
  const lead = shelf.covers.find((c) => c.paletteHex?.length)?.paletteHex ?? [];

  return (
    <Sheet onClose={onClose} label={shelf.name} pad={step === "menu" ? "menu" : "form"}>
      {step === "menu" && (
        <div className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3 px-2.5 pb-2">
            <span className="min-w-0 truncate font-brand text-[24px] text-text">{shelf.name}</span>
            <span className="flex-none font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">
              {kindMeta(shelf.itemCount, shelf.byKind)}
            </span>
          </div>
          <MenuRow icon="plus" label="Agregar títulos" href={`/descubrir?buscar=1&to=${shelf.id}`} />
          <MenuRow icon="share" label="Compartir" onClick={() => setStep("share")} />
          <MenuRow icon="pencil" label="Renombrar" onClick={() => setStep("rename")} />
        </div>
      )}
      {step === "share" && (
        <ShareBody
          backlogId={shelf.id}
          name={shelf.name}
          count={shelf.itemCount}
          covers={shelf.covers}
          paletteHex={lead}
          username={username}
          profilePublic={profilePublic}
          visibility={visibility}
        />
      )}
      {step === "rename" && (
        <RenameBody backlogId={shelf.id} name={shelf.name} vibe={shelf.vibe} />
      )}
    </Sheet>
  );
}

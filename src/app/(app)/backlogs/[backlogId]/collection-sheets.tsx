"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { createBacklogAction } from "@/app/actions/backlog-actions";
import { useSheetDismiss } from "@/components/ui";
import { GLASS_BUTTON, Glyph, SKELETON_PULSE, type GlyphKind } from "@/components/kura/components";
import { FanPickRow, NewCollectionRow } from "@/components/kura/fan-row";
import { KIcon } from "@/components/kura/icons";
import { posterFallbackStyle } from "@/components/kura/poster-fallback";
import {
  ChoiceRow,
  MenuGap,
  MenuRow,
  SHEET_FIELD,
  SHEET_SOLID,
  SheetTitle,
} from "@/components/kura/sheet-parts";
import type { CollectionItem, OtherCollection } from "@/modules/backlog/collection-item";
import { COLLECTION_NAME_MAX } from "@/modules/backlog/name-limit";
import { CollectionSheetHead } from "../collection-forms";
import { FORMAT, REACTION, SORTS, glyphOf, type Sort } from "./collection-shared";

/**
 * The insides of the collection's ONE sheet (collection-body.tsx owns the
 * <Sheet> and which body is in it): Opciones (18a), Ordenar (O3a), Editar el
 * orden (O3b), holding a title (18c) and Mover a (O4a). Rename, privacy,
 * share and delete live in ../collection-forms.tsx, shared with the cards.
 *
 * Presentational: every write is a callback the body hands in (the hook
 * use-collection-mutations.ts) — except "Nueva colección" inside Mover a,
 * which creates its target inline.
 */

/** 18a Más — the collection's Opciones. */
export function OptionsBody({
  owned,
  name,
  count,
  view,
  pinned,
  sortLabel,
  visibilityLabel,
  addHref,
  onView,
  onPin,
  go,
}: {
  owned: boolean;
  name: string;
  count: number;
  view: "shelf" | "list";
  pinned: boolean;
  sortLabel: string;
  visibilityLabel: string;
  addHref: string;
  onView: () => void;
  onPin: () => void;
  go: (kind: "sort" | "reorder" | "rename" | "privacy" | "share" | "delete") => void;
}) {
  const dismiss = useSheetDismiss();
  const viewRow = (
    <MenuRow
      icon={view === "list" ? "film" : "list"}
      label={view === "list" ? "Ver en columnas" : "Ver como lista"}
      onClick={() => {
        onView();
        dismiss?.();
      }}
    />
  );
  const head = <CollectionSheetHead name={name} count={count} />;
  if (!owned) {
    return (
      <div className="flex flex-col gap-0.5">
        {head}
        {viewRow}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-0.5">
      {head}
      <MenuRow icon="plus" label="Agregar títulos" href={addHref} />
      <MenuRow icon="share" label="Compartir" onClick={() => go("share")} />
      <MenuRow
        icon="pin"
        label={pinned ? "Desfijar" : "Fijar"}
        aside={pinned ? "fijada" : undefined}
        onClick={() => {
          onPin();
          dismiss?.();
        }}
      />
      <MenuGap />
      {viewRow}
      <MenuRow icon="sort" label="Ordenar" aside={sortLabel} onClick={() => go("sort")} />
      {/* Right after Ordenar: Ordenar picks how you LOOK at it (Manual is one
          of the modes), Reordenar edits that manual order — the one everyone
          sees. It left the body (founder, 2026-09-27). */}
      {/* Not "Reordenar" beside "Ordenar" (critique 2026-09-27): two near-
          identical verbs. The aside says whose order it is. */}
      {count > 1 && (
        <MenuRow icon="grip" label="Editar el orden" aside="el que ven todos" onClick={() => go("reorder")} />
      )}
      <MenuRow icon="pencil" label="Editar" onClick={() => go("rename")} />
      <MenuRow icon="lock" label="Quién la ve" aside={visibilityLabel} onClick={() => go("privacy")} />
      <MenuGap />
      <MenuRow icon="trash" label="Borrar colección" onClick={() => go("delete")} />
    </div>
  );
}

/** O3a — ordenar. Manual is the owner's order (Reordenar). */
export function SortBody({ value, onPick }: { value: Sort; onPick: (s: Sort) => void }) {
  const dismiss = useSheetDismiss();
  return (
    <div className="flex flex-col gap-1.5">
      <SheetTitle close={false}>ordenar</SheetTitle>
      <div role="radiogroup" className="flex flex-col">
        {SORTS.map((s) => (
          <ChoiceRow
            key={s.id}
            label={s.label}
            on={value === s.id}
            onSelect={() => {
              onPick(s.id);
              dismiss?.();
            }}
          />
        ))}
      </div>
    </div>
  );
}

const ROW_H = 64;

/**
 * O3b — Reordenar: every title of the collection in its manual order, each
 * row with a grip. Drag the grip (the row follows the finger and the others
 * make room) or focus it and use ↑/↓. "Guardar orden" hands the whole order
 * to the body (`saveOrder`: optimistic, one write, Reintentar in the toast)
 * and closes; closing the sheet any other way discards it.
 */
/**
 * Reordenar on a PAGED collection (colecciones largas, ronda 8): the owner
 * drags among ALL of its titles, so the whole collection is read when the
 * sheet opens — skeleton while it comes, Reintentar if it doesn't. `skip`
 * are the titles a pending Quitar already hid.
 */
export function ReorderLoader({
  load,
  skip,
  onSave,
}: {
  load: () => Promise<{ ok: true; value: { items: CollectionItem[] } } | { ok: false; error: string }>;
  skip: ReadonlySet<string>;
  onSave: (order: string[], all: CollectionItem[]) => void;
}) {
  const [all, setAll] = useState<CollectionItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [tries, setTries] = useState(0);

  useEffect(() => {
    let live = true;
    void load().then((res) => {
      if (!live) return;
      if (res.ok) setAll(res.value.items);
      else setFailed(true);
    });
    return () => {
      live = false;
    };
  }, [load, tries]);

  if (all) {
    const items = all.filter((it) => !skip.has(it.backlogItemId));
    return <ReorderBody items={items} onSave={(order) => onSave(order, items)} />;
  }
  return (
    <div className="flex flex-col gap-1.5">
      <SheetTitle>editar el orden</SheetTitle>
      {/* Always mounted (regla de la ronda 3); empty, it takes no room. */}
      <p role="status" className="font-sans text-[14px] leading-[1.45] text-text-2 empty:hidden">
        {failed ? "No pudimos cargar los títulos." : null}
      </p>
      {failed ? (
        <button
          type="button"
          onClick={() => {
            setFailed(false);
            setTries((n) => n + 1);
          }}
          className={`${GLASS_BUTTON} mt-2 self-start`}
        >
          Reintentar
        </button>
      ) : (
        <div aria-busy="true" aria-label="Cargando títulos" className={`flex flex-col ${SKELETON_PULSE}`}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3.5 px-1" style={{ height: ROW_H }}>
              <span className="flex w-11 flex-none justify-center">
                <span className="block h-[51px] w-[34px] rounded-[var(--r-cover-s)] bg-surface-2" />
              </span>
              <span className="h-3.5 w-2/5 rounded-full bg-surface-2" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ReorderBody({
  items,
  onSave,
}: {
  items: CollectionItem[];
  onSave: (order: string[]) => void;
}) {
  const dismiss = useSheetDismiss();
  const [order, setOrder] = useState(items);
  const [drag, setDrag] = useState<{ from: number; dy: number } | null>(null);
  const startY = useRef(0);

  const to = drag
    ? Math.max(0, Math.min(order.length - 1, drag.from + Math.round(drag.dy / ROW_H)))
    : -1;

  function moveItem(from: number, target: number) {
    if (from === target) return;
    setOrder((o) => {
      const next = [...o];
      const [it] = next.splice(from, 1);
      next.splice(target, 0, it);
      return next;
    });
  }

  function save() {
    onSave(order.map((it) => it.backlogItemId));
    dismiss?.();
  }

  return (
    <div className="flex flex-col gap-1.5">
      <SheetTitle>editar el orden</SheetTitle>
      <p className="pb-2 font-sans text-[13px] leading-[1.45] text-text-2">
        Arrastra desde las rayas. Así se ve la colección para todos.
      </p>
      <ol className="relative flex flex-col">
        {order.map((it, i) => {
          const dragging = drag?.from === i;
          let shift = 0;
          if (drag && !dragging) {
            if (drag.from < i && i <= to) shift = -ROW_H;
            else if (to <= i && i < drag.from) shift = ROW_H;
          }
          const album = it.mediaType === "album";
          return (
            <li
              key={it.backlogItemId}
              className={`flex items-center gap-3.5 rounded-[var(--r-surface)] px-1 ${
                dragging ? "z-10 bg-surface-1 shadow-float" : "transition-transform duration-200"
              }`}
              style={{
                height: ROW_H,
                transform: `translateY(${dragging ? drag.dy : shift}px)`,
              }}
            >
              <span className="flex w-11 flex-none justify-center">
              <span
                className="relative block flex-none overflow-hidden rounded-[var(--r-cover-s)] bg-surface-2"
                style={{
                  width: album ? 44 : 34,
                  height: album ? 44 : 51,
                  ...(it.posterUrl ? null : posterFallbackStyle(it.paletteHex)),
                }}
              >
                {it.posterUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- hotlinked CDN (ADR-007)
                  <img src={it.posterUrl} alt="" loading="lazy" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
                )}
              </span>
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate font-brand text-[17px] italic leading-[1.1] text-text">{it.title}</span>
                {/* The list row's meta (creator, or the format): no position —
                    the order IS the position — and no year (founder, 2026-09-27). */}
                <span className="truncate font-mono text-[10px] uppercase tracking-[0.08em] text-text-2">
                  {it.byline || FORMAT[it.mediaType].one}
                </span>
              </span>
              <button
                type="button"
                aria-label={`Mover ${it.title}. Posición ${i + 1} de ${order.length}. Usa las flechas.`}
                onPointerDown={(e) => {
                  e.stopPropagation(); // the sheet's own drag-to-dismiss stays out of it
                  e.currentTarget.setPointerCapture(e.pointerId);
                  startY.current = e.clientY;
                  setDrag({ from: i, dy: 0 });
                }}
                onPointerMove={(e) => {
                  if (drag?.from === i) setDrag({ from: i, dy: e.clientY - startY.current });
                }}
                onPointerUp={() => {
                  if (drag) moveItem(drag.from, to);
                  setDrag(null);
                }}
                onPointerCancel={() => setDrag(null)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowUp" && i > 0) {
                    e.preventDefault();
                    moveItem(i, i - 1);
                  } else if (e.key === "ArrowDown" && i < order.length - 1) {
                    e.preventDefault();
                    moveItem(i, i + 1);
                  }
                }}
                className="flex h-11 w-11 flex-none cursor-grab touch-none items-center justify-center text-text-2 active:cursor-grabbing"
              >
                <KIcon name="grip" size={20} strokeWidth={3} />
              </button>
            </li>
          );
        })}
      </ol>
      <button type="button" onClick={save} className={`${SHEET_SOLID} mt-2.5`}>
        Guardar orden
      </button>
    </div>
  );
}

/**
 * 18c — holding a title. `reduced` (9b, the automatic "no puedo esperar"):
 * only Tu reacción and Reseñar — a title there isn't a membership, so there
 * is no cover, no move and nothing to remove.
 */
export function ItemBody({
  it,
  reduced = false,
  isCover,
  onCover,
  onMove,
  onRemove,
}: {
  it: CollectionItem;
  reduced?: boolean;
  /** It is the CHOSEN cover (not just first in the order). */
  isCover: boolean;
  onCover: (on: boolean) => void;
  onMove: () => void;
  onRemove: () => void;
}) {
  const dismiss = useSheetDismiss();
  const glyph = glyphOf(it);
  const meta = [FORMAT[it.mediaType].one, it.year, it.byline].filter(Boolean).join(" · ");
  const reactionIcon = glyph ? <Glyph kind={glyph as GlyphKind} size={18} /> : "review";
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex flex-col gap-[5px] px-2.5 pb-2.5">
        <span className="font-brand text-[22px] italic leading-[1.1] text-text">{it.title}</span>
        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">{meta}</span>
      </div>
      <MenuRow
        icon={reactionIcon}
        label="Tu reacción"
        aside={glyph ? REACTION[glyph] : undefined}
        href={`/item/${it.catalogItemId}`}
      />
      <MenuRow icon="review" label="Reseñar" href={`/item/${it.catalogItemId}`} />
      {!reduced && (
        <>
      <MenuRow
        icon="image"
        label={isCover ? "Portada automática" : "Usar como portada"}
        aside={isCover ? "portada" : undefined}
        onClick={() => {
          onCover(!isCover);
          dismiss?.();
        }}
      />
      <MenuRow icon="arrow" label="Mover a otra colección" onClick={onMove} />
      <MenuGap />
      <MenuRow
        icon="minus"
        label="Quitar de la colección"
        onClick={() => {
          onRemove();
          dismiss?.();
        }}
      />
        </>
      )}
    </div>
  );
}

/**
 * O4a — mover a (one or more collections; "Nueva colección" creates one
 * inline). Each row is a mini fan, the name and its count (7a).
 */
export function MoveBody({
  it,
  current,
  others,
  already,
  onMove,
}: {
  it: CollectionItem;
  current: OtherCollection;
  others: OtherCollection[];
  already: string[];
  onMove: (targets: OtherCollection[]) => void;
}) {
  const dismiss = useSheetDismiss();
  const [list, setList] = useState(others);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const album = it.mediaType === "album";
  const meta = [FORMAT[it.mediaType].one, it.year].filter(Boolean).join(" · ");

  async function createTarget(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFailed(false);
    const res = await createBacklogAction({ name: newName }).catch(() => null);
    setBusy(false);
    if (!res || !("id" in res) || !res.id) {
      // The name stays in the field; the note under it says why.
      setFailed(true);
      return;
    }
    const id = res.id;
    const created: OtherCollection = { id, name: newName.trim(), fan: [], count: 0 };
    setList((l) => [created, ...l]);
    setPicked((p) => new Set(p).add(id));
    setCreating(false);
    setNewName("");
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-3.5 pb-3">
        <span
          className="relative block flex-none overflow-hidden rounded-[var(--r-cover-s)] bg-surface-2 shadow-cover"
          style={{
            width: album ? 56 : 44,
            height: album ? 56 : 66,
            ...(it.posterUrl ? null : posterFallbackStyle(it.paletteHex)),
          }}
        >
          {it.posterUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- hotlinked CDN (ADR-007)
            <img src={it.posterUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          )}
        </span>
        <span className="flex min-w-0 flex-col gap-[5px]">
          <span className="truncate font-brand text-[20px] italic text-text">{it.title}</span>
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">{meta}</span>
        </span>
      </div>
      <span className="pb-1 font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">mover a</span>

      {creating ? (
        <form onSubmit={createTarget} className="flex items-center gap-2 py-1">
          <input
            autoFocus
            required
            maxLength={COLLECTION_NAME_MAX}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            aria-label="Nombre de la nueva colección"
            placeholder="nombre de la colección"
            className={SHEET_FIELD}
          />
          <button
            type="submit"
            disabled={busy || !newName.trim()}
            className="h-[52px] flex-none rounded-full bg-[var(--glass-bg)] px-4 font-sans text-[15px] font-semibold text-text bl-press disabled:opacity-40"
          >
            {busy ? "…" : "Crear"}
          </button>
        </form>
      ) : (
        <NewCollectionRow onClick={() => setCreating(true)} />
      )}
      {creating && failed && (
        <p role="alert" className="flex items-center gap-2 pb-1 font-sans text-[14px] leading-[1.4] text-text-2">
          <KIcon name="warning" size={16} className="flex-none text-text" />
          No se creó la colección. Revisa tu conexión y vuelve a intentarlo.
        </p>
      )}

      {/* No inner scroller: the Sheet's own scroller (with its touch-action
          hook) carries a long list — a nested one would be pan-blocked by the
          panel's touch-none (learnings 2026-09-17). */}
      <div className="flex flex-col">
        <FanPickRow name={current.name} covers={current.fan} count={current.count} on note="aquí está" disabled onClick={() => {}} />
        {list.map((c) => {
          const there = already.includes(c.id);
          return (
            <FanPickRow
              key={c.id}
              name={c.name}
              covers={c.fan}
              count={c.count}
              on={there || picked.has(c.id)}
              note={there ? "ya está" : undefined}
              disabled={there}
              onClick={() =>
                setPicked((p) => {
                  const n = new Set(p);
                  if (n.has(c.id)) n.delete(c.id);
                  else n.add(c.id);
                  return n;
                })
              }
            />
          );
        })}
      </div>

      <div className="mt-2.5">
        <button
          type="button"
          disabled={picked.size === 0}
          onClick={() => {
            const targets = list.filter((c) => picked.has(c.id));
            onMove(targets);
            dismiss?.();
          }}
          className={SHEET_SOLID}
        >
          Mover
        </button>
      </div>
    </div>
  );
}

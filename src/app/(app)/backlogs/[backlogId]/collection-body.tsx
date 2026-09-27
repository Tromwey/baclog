"use client";

import type { BacklogVisibility } from "@/modules/backlog/visibility";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useImperativeHandle, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import {
  createBacklogAction,
  reorderBacklogItemsAction,
  setBacklogCoverAction,
  setBacklogPinnedAction,
} from "@/app/actions/backlog-actions";
import {
  addItemAction,
  removeMembershipAction,
} from "@/app/actions/backlog-item-actions";
import { CoachNote, Sheet, useSheetDismiss } from "@/components/ui";
import { Glyph, Seal, type GlyphKind } from "@/components/kura/components";
import { FanPickRow, NewCollectionRow } from "@/components/kura/fan-row";
import { KIcon, type KIconName } from "@/components/kura/icons";
import { Masonry, type MasonryItem } from "@/components/kura/masonry";
import {
  ChoiceRow,
  MenuGap,
  MenuRow,
  SHEET_FIELD,
  SHEET_SOLID,
  SheetTitle,
} from "@/components/kura/sheet-parts";
import { releaseLabel } from "@/components/kura/tint";
import { Toast, useToast } from "@/components/kura/toast";
import { useHold } from "@/components/kura/use-hold";
import { usePref } from "@/components/kura/use-pref";
import { posterFallbackStyle } from "@/components/cover-tile";
import type { CollectionItem, OtherCollection } from "@/modules/backlog/collection-item";
import { fanHexes, fanOf, ownCreditLine, type Collaborator } from "@/modules/backlog/fan";
import type { MediaType } from "@/modules/catalog/types";
import {
  CollectionSheetHead,
  DeleteBody,
  PrivacyBody,
  RenameBody,
  ShareBody,
  VISIBILITY_LABEL,
} from "../collection-forms";

export type { CollectionItem, OtherCollection };

/**
 * The body of a collection (Colecciones · una sola página, 2026-09-27 —
 * design 10): everything BELOW the fan, shared by Tus colecciones (10a, under
 * the carousel) and the collection (10b, under its header). Only the arrival
 * differs — the carousel in 10a, Volver in 10b.
 *
 *  - the intro: the line in italic, the credits (owner's seal 26 + the
 *    collaborators' + "tú y mo · N títulos" in Hanken 13 — with nobody to
 *    credit, just "N títulos") and the format pills with their count, ALWAYS
 *    when there are titles: one format = one pill labelling it; several =
 *    pills that FILTER (tap again to clear);
 *  - EVERY title in three columns (Masonry) in the owner's manual order, or
 *    as a list ("Ver como lista" and Ordenar are per collection, per device —
 *    `usePref`), straight under the intro: no "el orden" heading and no
 *    Reordenar link (founder, 2026-09-27) — Reordenar lives in Opciones;
 *  - Guardar orden is OPTIMISTIC and the new #1 leads the fan: a new order
 *    whose #1 isn't the chosen cover sends the cover back to automatic
 *    (setBacklogCoverAction null), so the fan and the page's gradient repaint
 *    with the new #1 at once (`onFanChange` tells 10a, whose fans come from
 *    the server's shelves);
 *  - holding a title opens 18c (Tu reacción · Reseñar · Usar como portada ·
 *    Mover a otra colección · Quitar de la colección); on the automatic
 *    "no puedo esperar" only Tu reacción and Reseñar (9b);
 *  - an empty collection shows 6b ("colección nueva, repisa vacía.");
 *  - the ONE sheet: Opciones (18a) and its steps, Compartir, 18c and Mover a.
 *
 * The header's chips (Compartir, Opciones) live with each screen, so the
 * body is opened from outside: `ref.open(kind)` (10a, whose header sits above
 * the carousel) or the render prop's `api.open` (10b, whose whole page —
 * background and fan included — follows what is still present).
 *
 * Quitar is DEFERRED: the title hides at once and the write happens when its
 * "Deshacer" toast leaves — removing a title's LAST membership GC's its state
 * and review (removeMembershipAction), so undoing after the fact couldn't
 * bring those back. Mover writes at once (it adds before it removes, so the
 * state always survives) and its undo reverses exactly what it created.
 *
 * `mode="auto"` is the automatic collection "no puedo esperar" (5a): the
 * countdown on every cover, no membership actions, Opciones only switches the
 * view.
 */

type Sort = "manual" | "recent" | "title" | "state" | "year";
const SORTS: { id: Sort; label: string }[] = [
  { id: "manual", label: "Manual" },
  { id: "recent", label: "Recientes" },
  { id: "title", label: "Título" },
  { id: "state", label: "Estado" },
  { id: "year", label: "Año" },
];
const SORT_IDS = SORTS.map((s) => s.id);
const VIEWS = ["shelf", "list"] as const;

const FORMAT: Record<MediaType, { icon: KIconName; singular: string; plural: string; one: string }> = {
  film: { icon: "film", singular: "película", plural: "películas", one: "Cine" },
  series: { icon: "series", singular: "serie", plural: "series", one: "Serie" },
  album: { icon: "music", singular: "álbum", plural: "álbumes", one: "Álbum" },
};

/** Holding a title (18c) — Colecciones · transiciones §4: the sheet's
 *  spring at .4 in / .3 out (18 px, scale .97 are the hook's defaults). */
const HOLD_SHEET_MOTION = { enter: 0.4, exit: 0.3 } as const;

const REACTION: Record<"obsessed" | "liked" | "completed", string> = {
  obsessed: "Me obsesiona",
  liked: "Me gusta",
  completed: "Completo",
};

function glyphOf(it: CollectionItem): "obsessed" | "liked" | "completed" | null {
  if (it.obsessed) return "obsessed";
  if (it.verdict === "liked") return "liked";
  if (it.status === "completed") return "completed";
  return null;
}

function stateRank(it: CollectionItem): number {
  const g = glyphOf(it);
  return g === "obsessed" ? 0 : g === "liked" ? 1 : g === "completed" ? 2 : 3;
}

function waitOf(it: CollectionItem, now: number): string | null {
  if (!it.releaseDate) return null;
  return new Date(it.releaseDate).getTime() > now ? releaseLabel(it.releaseDate, now) : null;
}

function sortItems(items: CollectionItem[], sort: Sort): CollectionItem[] {
  const out = [...items];
  switch (sort) {
    case "recent":
      return out.sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());
    case "title":
      return out.sort((a, b) => a.title.localeCompare(b.title, "es", { sensitivity: "base" }));
    case "state":
      return out.sort((a, b) => stateRank(a) - stateRank(b));
    case "year":
      return out.sort((a, b) => (b.year ?? -Infinity) - (a.year ?? -Infinity));
    default:
      return out; // the loader's order: the owner's manual order
  }
}

/**
 * The titles still present in the manual order a Guardar orden just wrote
 * (backlogItemIds): titles that arrived meanwhile stay on top (unplaced
 * first, as `byManualOrder` reads them), gone ones drop out.
 */
function arrange(items: CollectionItem[], order: readonly string[]): CollectionItem[] {
  const at = new Map(order.map((id, i) => [id, i]));
  const unplaced = items.filter((it) => !at.has(it.backlogItemId));
  const placed = items
    .filter((it) => at.has(it.backlogItemId))
    .sort((a, b) => at.get(a.backlogItemId)! - at.get(b.backlogItemId)!);
  return [...unplaced, ...placed];
}

type SheetState =
  | { kind: "options" }
  | { kind: "sort" }
  | { kind: "reorder" }
  | { kind: "rename" }
  | { kind: "privacy" }
  | { kind: "share" }
  | { kind: "delete" }
  | { kind: "item"; item: CollectionItem }
  | { kind: "move"; item: CollectionItem };

/** What the header chips reach from outside the body. */
export interface CollectionControls {
  open: (kind: "options" | "share") => void;
}

/** What the render prop gets: the live facts (after a deferred Quitar) and the body. */
export interface CollectionApi extends CollectionControls {
  present: CollectionItem[];
  fan: CollectionItem[];
  hexes: string[];
  empty: boolean;
  addHref: string;
  body: ReactNode;
}

export interface CollectionBodyProps {
  mode: "owned" | "auto";
  backlog: {
    id: string;
    name: string;
    vibe: string | null;
    visibility: BacklogVisibility;
    pinned?: boolean;
    coverCatalogItemId?: string | null;
  };
  items: CollectionItem[];
  now: number;
  others?: OtherCollection[];
  memberships?: Record<string, string[]>;
  /** The owner's seal in the credits (name, photo, palette). */
  owner?: { name: string; image: string | null; hexes: string[] } | null;
  collaborators?: Collaborator[];
  username?: string | null;
  profilePublic?: boolean;
  /** First-run moment 2 under the titles. */
  coach?: boolean;
  /** Extra classes on the intro block (its top spacing differs per screen). */
  introClassName?: string;
  /** Where the toast floats (default: over the dock, which every screen
   *  that mounts this body keeps since 2026-09-27). */
  toastBottom?: number | string;
  /**
   * A Guardar orden repainted the fan before the server answered (10a paints
   * its fans from the server's shelves, so it needs telling); null = it
   * failed, go back to the server's.
   */
  onFanChange?: (next: { fan: CollectionItem[]; hexes: string[] } | null) => void;
}

export function CollectionBody({
  mode,
  backlog,
  items,
  now,
  others = [],
  memberships = {},
  owner = null,
  collaborators = [],
  username = null,
  profilePublic = false,
  coach = false,
  introClassName = "",
  toastBottom = "calc(var(--dock-clearance) - 22px)",
  onFanChange,
  ref,
  children,
}: CollectionBodyProps & {
  ref?: Ref<CollectionControls>;
  children?: (api: CollectionApi) => ReactNode;
}) {
  const router = useRouter();
  const owned = mode === "owned";
  const [format, setFormat] = useState<MediaType | null>(null);
  const [view, setView] = usePref(`kura:col:${backlog.id}:view`, "shelf", VIEWS);
  const [sort, setSort] = usePref<Sort>(`kura:col:${backlog.id}:sort`, "manual", SORT_IDS);
  const [visibility, setVisibility] = useState(backlog.visibility);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const toastHost = useToast();
  const { show } = toastHost;

  const open = (kind: "options" | "share") => setSheet({ kind });
  useImperativeHandle(ref, () => ({ open: (kind) => setSheet({ kind }) }), []);

  // Guardar orden, painted before the server answers. It holds only while
  // `items` is the array it was made against: the refresh that follows the
  // write brings the server's (identical) order and drops it.
  const [curated, setCurated] = useState<{
    base: CollectionItem[];
    order: string[];
    cover: string | null;
  } | null>(null);
  const live = curated && curated.base === items ? curated : null;

  const present = useMemo(() => {
    const kept = items.filter((it) => !hidden.has(it.backlogItemId));
    return live ? arrange(kept, live.order) : kept;
  }, [items, hidden, live]);
  const coverId = live ? live.cover : (backlog.coverCatalogItemId ?? null);
  const fan = fanOf(present, coverId);
  const hexes = fanHexes(fan, present);

  const counts = useMemo(() => {
    const c: Record<MediaType, number> = { film: 0, series: 0, album: 0 };
    for (const it of present) c[it.mediaType] += 1;
    return c;
  }, [present]);
  // Pills in the order each format first appears.
  const formats = useMemo(() => {
    const seen: MediaType[] = [];
    for (const it of present) if (!seen.includes(it.mediaType)) seen.push(it.mediaType);
    return seen;
  }, [present]);

  const activeFormat = format && counts[format] > 0 ? format : null;
  const shown = useMemo(() => {
    const base = activeFormat ? present.filter((it) => it.mediaType === activeFormat) : present;
    return owned ? sortItems(base, sort) : base;
  }, [present, activeFormat, sort, owned]);

  // 18c on every title; the automatic collection's is the reduced one (9b).
  const hold = (it: CollectionItem) => () => setSheet({ kind: "item", item: it });
  const addHref = `/descubrir?buscar=1&to=${backlog.id}`;

  /* ---------------------------------------------------------- mutations */

  function unhide(id: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function commitRemove(it: CollectionItem) {
    void removeMembershipAction(it.backlogItemId)
      .then(() => router.refresh())
      .catch(() => {
        unhide(it.backlogItemId);
        show({
          kind: "error",
          message: "No se pudo quitar",
          actionLabel: "Reintentar",
          onAction: () => remove(it),
        });
      });
  }

  function remove(it: CollectionItem) {
    setHidden((prev) => new Set(prev).add(it.backlogItemId));
    show({
      message: `Quitado de ${backlog.name}`,
      actionLabel: "Deshacer",
      onAction: () => unhide(it.backlogItemId),
      onExpire: () => commitRemove(it),
    });
  }

  async function move(it: CollectionItem, targets: OtherCollection[]) {
    setHidden((prev) => new Set(prev).add(it.backlogItemId));
    const before = new Set(memberships[it.catalogItemId] ?? []);
    const created: string[] = [];
    try {
      for (const t of targets) {
        const res = await addItemAction({ backlogId: t.id, catalogItemId: it.catalogItemId });
        if (!("id" in res)) throw new Error("add failed");
        if (!before.has(t.id) && res.id) created.push(res.id);
      }
      await removeMembershipAction(it.backlogItemId);
      router.refresh();
      show({
        message:
          targets.length === 1 ? `Movido a ${targets[0].name}` : `Movido a ${targets.length} colecciones`,
        actionLabel: "Deshacer",
        onAction: () => {
          void (async () => {
            try {
              await addItemAction({ backlogId: backlog.id, catalogItemId: it.catalogItemId });
              for (const id of created) await removeMembershipAction(id);
              router.refresh();
            } catch {
              show({ kind: "error", message: "No se pudo deshacer" });
            }
          })();
        },
      });
    } catch {
      // Roll back what this attempt created, then say so.
      for (const id of created) await removeMembershipAction(id).catch(() => {});
      unhide(it.backlogItemId);
      show({
        kind: "error",
        message: "No se pudo mover",
        actionLabel: "Reintentar",
        onAction: () => void move(it, targets),
      });
    }
  }

  async function setCover(it: CollectionItem | null) {
    const res = await setBacklogCoverAction(backlog.id, it?.catalogItemId ?? null).catch(() => null);
    if (!res || !("ok" in res)) {
      show({ kind: "error", message: "No se pudo cambiar la portada" });
      return;
    }
    router.refresh();
    show({ message: it ? "Nueva portada" : "Portada automática" });
  }

  /**
   * Reordenar › Guardar orden. The new #1 leads the fan (founder,
   * 2026-09-27): the fan puts a chosen cover in front of the order, so a new
   * order whose #1 isn't that cover also sends the cover back to automatic.
   * Both paint at once; a failed write goes back to the server's and offers
   * Reintentar.
   */
  function saveOrder(order: string[]) {
    setSort("manual");
    setFormat(null);
    const next = arrange(present, order);
    if (next.every((it, i) => it.backlogItemId === present[i]?.backlogItemId)) return;
    const clearCover = coverId !== null && coverId !== next[0]?.catalogItemId;
    const cover = clearCover ? null : coverId;
    setCurated({ base: items, order, cover });
    const fan = fanOf(next, cover);
    onFanChange?.({ fan, hexes: fanHexes(fan, next) });

    void (async () => {
      const res = await reorderBacklogItemsAction(backlog.id, order).catch(() => null);
      if (!res || !("ok" in res)) {
        setCurated(null);
        onFanChange?.(null);
        show({
          kind: "error",
          message: "No se pudo guardar el orden",
          actionLabel: "Reintentar",
          onAction: () => saveOrder(order),
        });
        return;
      }
      if (clearCover) {
        const c = await setBacklogCoverAction(backlog.id, null).catch(() => null);
        if (!c || !("ok" in c)) show({ kind: "error", message: "No se pudo cambiar la portada" });
      }
      router.refresh();
    })();
  }

  async function togglePin() {
    const pinned = !backlog.pinned;
    const res = await setBacklogPinnedAction(backlog.id, pinned).catch(() => null);
    if (!res || !("ok" in res)) {
      show({ kind: "error", message: "No se pudo guardar" });
      return;
    }
    router.refresh();
    show({ message: pinned ? "Fijada" : "Ya no está fijada" });
  }

  /* -------------------------------------------------------------- render */

  const empty = present.length === 0;
  const masonry: MasonryItem[] = shown.map((it) => ({
    key: it.backlogItemId,
    href: `/item/${it.catalogItemId}`,
    title: it.title,
    mediaType: it.mediaType,
    posterUrl: it.posterUrl,
    paletteHex: it.paletteHex,
    glyph: glyphOf(it),
    wait: waitOf(it, now),
    flightKey: it.catalogItemId,
  }));
  const byKey = new Map(shown.map((it) => [it.backlogItemId, it]));

  const body = (
    <>
      {owned && !empty && (
        <div className={`flex min-w-0 flex-col items-center gap-2.5 px-6 pb-[26px] text-center ${introClassName}`}>
          {backlog.vibe && (
            <span className="max-w-[32ch] font-brand text-[16px] italic leading-[1.3] text-text-2 [text-wrap:pretty]">
              {backlog.vibe}
            </span>
          )}
          <Credits owner={owner} collaborators={collaborators} />
          {/* Always, when there are titles (founder, 2026-09-27): with one
              format it's a single pill that labels the type with its count
              (nothing to filter); with more, each one filters. */}
          {formats.length > 0 && (
            <div className="mt-1.5 flex flex-wrap justify-center gap-1.5">
              {formats.map((k) => {
                const sel = activeFormat === k;
                if (formats.length === 1) {
                  return (
                    <span
                      key={k}
                      aria-label={`${counts[k]} ${counts[k] === 1 ? FORMAT[k].singular : FORMAT[k].plural}`}
                      className="inline-flex h-10 items-center gap-[7px] rounded-full bg-[var(--glass-bg)] px-3.5 font-mono text-[12px] text-text"
                    >
                      <KIcon name={FORMAT[k].icon} size={15} />
                      {counts[k]}
                    </span>
                  );
                }
                return (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={sel}
                    aria-label={`Filtrar: ${counts[k]} ${FORMAT[k].plural}`}
                    onClick={() => setFormat(sel ? null : k)}
                    className={`inline-flex h-10 items-center gap-[7px] rounded-full px-3.5 font-mono text-[12px] text-text transition-[background-color] duration-200 ${
                      sel ? "bg-white/[0.24]" : "bg-[var(--glass-bg)]"
                    }`}
                  >
                    <KIcon name={FORMAT[k].icon} size={15} />
                    {counts[k]}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {empty ? (
        <EmptyCollection addHref={addHref} auto={!owned} />
      ) : (
        <>
          {view === "list" ? (
            <ListBody items={shown} now={now} hold={hold} />
          ) : (
            <Masonry
              items={masonry}
              onHold={(key) => {
                const it = byKey.get(key);
                if (it) setSheet({ kind: "item", item: it });
              }}
            />
          )}
        </>
      )}

      {/* First-run moment 2 (first-run.ts): what the glyphs on the covers
          mean, said once, until the first completion. */}
      {coach && !empty && owned && (
        <CoachNote className="mx-6 mt-2">
          <span className="flex flex-wrap gap-x-3.5 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              <Glyph kind="obsessed" size={11} /> te obsesiona
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Glyph kind="liked" size={11} /> te gusta
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Glyph kind="completed" size={11} /> completo
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Glyph kind="waiting" size={11} /> no puedes esperar
            </span>
          </span>
          Toca una portada para completarla o decir si te obsesiona. Mantenla presionada para moverla o quitarla.
        </CoachNote>
      )}
    </>
  );

  return (
    <>
      {children ? children({ present, fan, hexes, empty, addHref, open, body }) : body}

      {sheet && (
        <Sheet
          onClose={() => setSheet(null)}
          label={sheetLabel(sheet, backlog.name)}
          motion={sheet.kind === "item" ? HOLD_SHEET_MOTION : undefined}
          pad={sheet.kind === "options" || sheet.kind === "item" || sheet.kind === "share" ? "menu" : "form"}
        >
          {sheet.kind === "options" && (
            <OptionsBody
              owned={owned}
              name={backlog.name}
              count={present.length}
              view={view}
              pinned={!!backlog.pinned}
              sortLabel={SORTS.find((s) => s.id === sort)?.label ?? ""}
              visibilityLabel={VISIBILITY_LABEL[visibility]}
              addHref={addHref}
              onView={() => setView(view === "list" ? "shelf" : "list")}
              onPin={() => void togglePin()}
              go={(kind) => setSheet({ kind })}
            />
          )}
          {sheet.kind === "sort" && <SortBody value={sort} onPick={setSort} />}
          {sheet.kind === "reorder" && (
            <ReorderBody items={present} onSave={saveOrder} />
          )}
          {sheet.kind === "rename" && (
            <RenameBody backlogId={backlog.id} name={backlog.name} vibe={backlog.vibe} />
          )}
          {sheet.kind === "privacy" && (
            <PrivacyBody
              backlogId={backlog.id}
              name={backlog.name}
              value={visibility}
              onSaved={setVisibility}
            />
          )}
          {sheet.kind === "share" && owned && (
            <ShareBody
              backlogId={backlog.id}
              name={backlog.name}
              username={username}
              profilePublic={profilePublic}
              visibility={visibility}
            />
          )}
          {sheet.kind === "delete" && (
            <DeleteBody backlogId={backlog.id} name={backlog.name} count={present.length} />
          )}
          {sheet.kind === "item" && (
            <ItemBody
              it={sheet.item}
              reduced={!owned}
              isCover={fan[0]?.backlogItemId === sheet.item.backlogItemId && coverId === sheet.item.catalogItemId}
              onCover={(on) => void setCover(on ? sheet.item : null)}
              onMove={() => setSheet({ kind: "move", item: sheet.item })}
              onRemove={() => remove(sheet.item)}
            />
          )}
          {sheet.kind === "move" && (
            <MoveBody
              it={sheet.item}
              current={{ id: backlog.id, name: backlog.name, fan, count: present.length }}
              others={others}
              already={memberships[sheet.item.catalogItemId] ?? []}
              onMove={(targets) => void move(sheet.item, targets)}
            />
          )}
        </Sheet>
      )}

      <Toast host={toastHost} bottom={toastBottom} />
    </>
  );
}

function sheetLabel(s: SheetState, name: string): string {
  switch (s.kind) {
    case "options":
      return `Opciones de ${name}`;
    case "sort":
      return "Ordenar";
    case "reorder":
      return "Editar el orden";
    case "rename":
      return "Editar colección";
    case "privacy":
      return `Quién ve ${name}`;
    case "share":
      return `Compartir ${name}`;
    case "delete":
      return "Borrar colección";
    case "item":
      return s.item.title;
    case "move":
      return "Mover a";
  }
}

/* --------------------------------------------------------------- header */

/**
 * The credits (2a): the owner's seal and each collaborator's at 26,
 * overlapping by 7, then "tú y mo". Collaborators have no palette here —
 * their seals sit on `--s2` (§marca: "sin obsesión, el sello va sobre --s2").
 *
 * No count (founder, 2026-09-27): a collection nobody shares had no seals
 * either, so its credits line was ONLY "N títulos" — now there's nothing
 * left to say, and the whole line disappears (the intro's `gap` collapses on
 * its own; nothing to pad). With collaborators it's just the seals + names.
 */
function Credits({
  owner,
  collaborators,
}: {
  owner: { name: string; image: string | null; hexes: string[] } | null;
  collaborators: Collaborator[];
}) {
  if (collaborators.length === 0) return null;
  return (
    <div className="mt-0.5 flex items-center gap-2">
      <div className="flex">
        {owner && <Seal name={owner.name || "tú"} hexes={owner.hexes} src={owner.image} size={26} />}
        {collaborators.map((c) => (
          <span key={c.username ?? c.name} className="-ml-[7px] flex">
            <Seal name={c.name || c.username || "·"} hexes={[]} src={c.image} size={26} />
          </span>
        ))}
      </div>
      <span className="font-sans text-[13px] text-text-2">{ownCreditLine(collaborators)}</span>
    </div>
  );
}

/* ----------------------------------------------------------------- body */

type BodyProps = {
  items: CollectionItem[];
  now: number;
  hold: (it: CollectionItem) => (() => void) | undefined;
};

function ListRow({
  it,
  now,
  hold,
}: {
  it: CollectionItem;
  now: number;
  hold: BodyProps["hold"];
}) {
  const onHold = hold(it);
  const { handlers } = useHold(onHold ?? (() => {}));
  const album = it.mediaType === "album";
  const w = album ? 59 : 44;
  const h = album ? 59 : 66;
  const wait = waitOf(it, now);
  const glyph = glyphOf(it);
  // No year in a collection row: detail lives in the ficha (founder, 2026-09-27).
  const meta = it.byline || FORMAT[it.mediaType].one;
  return (
    <Link
      href={`/item/${it.catalogItemId}`}
      {...(onHold ? handlers : {})}
      className="flex min-h-20 select-none items-center gap-3.5 transition-opacity active:opacity-70 [-webkit-touch-callout:none]"
    >
      <span className="flex w-[60px] flex-none justify-center">
        <span
          className="relative block overflow-hidden rounded-[var(--r-cover-s)] bg-surface-2 shadow-cover"
          style={{ width: w, height: h, ...(it.posterUrl ? null : posterFallbackStyle(it.paletteHex)) }}
        >
          {it.posterUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- hotlinked CDN (ADR-007)
            <img src={it.posterUrl} alt="" loading="lazy" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
          )}
        </span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-[5px]">
        <span className="truncate font-brand text-[19px] italic leading-[1.1] text-text">{it.title}</span>
        <span className="truncate font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">{meta}</span>
      </span>
      {wait ? (
        <span className="inline-flex flex-none items-center gap-[5px] font-mono text-[11px] uppercase tracking-[0.04em] text-text">
          <Glyph kind="waiting" size={14} />
          {wait}
        </span>
      ) : glyph ? (
        <span role="img" aria-label={REACTION[glyph]} className="flex-none">
          <Glyph kind={glyph} size={14} />
        </span>
      ) : null}
    </Link>
  );
}

function ListBody({ items, now, hold }: BodyProps) {
  return (
    <div className="flex flex-col px-5 pt-2">
      {items.map((it) => (
        <ListRow key={it.backlogItemId} it={it} now={now} hold={hold} />
      ))}
    </div>
  );
}

/** 6b — "colección nueva, repisa vacía." + the glass Agregar títulos (copy of today). */
function EmptyCollection({ addHref, auto }: { addHref: string; auto: boolean }) {
  if (auto) {
    return (
      <div className="flex flex-col items-center gap-2.5 px-8 pt-4 text-center">
        <h2 className="font-brand text-[22px] font-normal leading-[1.15] text-text-2 [text-wrap:balance]">
          nada por estrenarse.
        </h2>
        <p className="font-sans text-[15px] leading-[1.5] text-text-2 [text-wrap:pretty]">
          Lo que guardes y todavía no salga aparece aquí solo, con cuánto falta.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3 px-7 pt-2 text-center">
      {/* Second voice, not a second headline (critique 2026-09-27): the
          name above is the title; this line sits under it at 22 in text-2. */}
      <h2 className="font-brand text-[22px] font-normal leading-[1.15] text-text-2 [text-wrap:balance]">
        colección nueva, repisa vacía.
      </h2>
      <p className="font-sans text-[15px] leading-[1.5] text-text-2 [text-wrap:pretty]">
        Empieza por lo que no puedes dejar de recomendar.
      </p>
      <Link
        href={addHref}
        className="mt-3.5 inline-flex min-h-12 items-center gap-2 rounded-full bg-[var(--glass-bg)] pl-[18px] pr-[22px] font-sans text-[16px] font-semibold text-text bl-press"
      >
        <KIcon name="plus" size={18} />
        Agregar títulos
      </Link>
    </div>
  );
}

/* --------------------------------------------------------------- sheets */

/** 18a Más — the collection's Opciones. */
function OptionsBody({
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
      <MenuRow icon="lock" label="Privacidad" aside={visibilityLabel} onClick={() => go("privacy")} />
      <MenuGap />
      <MenuRow icon="trash" label="Borrar colección" onClick={() => go("delete")} />
    </div>
  );
}

/** O3a — ordenar. Manual is the owner's order (Reordenar). */
function SortBody({ value, onPick }: { value: Sort; onPick: (s: Sort) => void }) {
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
function ReorderBody({
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
function ItemBody({
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
function MoveBody({
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
  const album = it.mediaType === "album";
  const meta = [FORMAT[it.mediaType].one, it.year].filter(Boolean).join(" · ");

  async function createTarget(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await createBacklogAction({ name: newName }).catch(() => null);
    setBusy(false);
    if (!res || !("id" in res) || !res.id) return;
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
            maxLength={60}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            aria-label="Nombre de la nueva colección"
            placeholder="Ponle nombre"
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

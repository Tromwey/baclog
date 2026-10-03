"use client";

import type { BacklogVisibility } from "@/modules/backlog/visibility";
import Link from "next/link";
import { useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import { CoachNote, Sheet } from "@/components/ui";
import { GLASS_BUTTON, Glyph, SKELETON_PULSE, Seal } from "@/components/kura/components";
import { KIcon } from "@/components/kura/icons";
import { Masonry, type MasonryItem } from "@/components/kura/masonry";
import { releaseLabel } from "@/components/kura/tint";
import { Toast, useToast } from "@/components/kura/toast";
import { useHold } from "@/components/kura/use-hold";
import { usePref } from "@/components/kura/use-pref";
import { posterFallbackStyle } from "@/components/kura/poster-fallback";
import type { CollectionItem, OtherCollection } from "@/modules/backlog/collection-item";
import { fanHexes, fanOf, ownCreditLine, type Collaborator } from "@/modules/backlog/fan";
import { MEDIA_TYPES, type MediaType } from "@/modules/catalog/types";
import { COLLECTION_PAGE_SIZE, isPagedSort, stateRank } from "@/modules/backlog/collection-cursor";
import {
  DeleteBody,
  PrivacyBody,
  RenameBody,
  ShareBody,
  VISIBILITY_LABEL,
} from "../collection-forms";
import { FORMAT, REACTION, SORTS, glyphOf, type Sort } from "./collection-shared";
import { ItemBody, MoveBody, OptionsBody, ReorderBody, ReorderLoader, SortBody } from "./collection-sheets";
import { arrange, useCollectionMutations, type CuratedOrder } from "./use-collection-mutations";
import { useCollectionPages, type CollectionPaging } from "./use-collection-pages";

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
 *
 * COLECCIONES LARGAS (founder, ronda 8): titles mount by pages of 60 as the
 * page scrolls (a sentinel under the list). Two ways, one footer:
 *  - `paging` given (the collection's page and its overlay from the
 *    profile): `items` is only the FIRST page, in the manual order; the rest
 *    comes from the server per order and format (use-collection-pages.ts).
 *    Nothing that speaks for the whole collection reads `items.length` then:
 *    the counts and the pills come from the server's aggregate, the fan from
 *    the manual head + the chosen cover, Reordenar reads the collection whole
 *    when it opens.
 *  - no `paging` (Tus colecciones and the automatic one, whose loaders hand
 *    the whole collection): the list is windowed in the client — same
 *    sentinel, nothing fetched. The "Título" order of a paged collection
 *    works this way too (it has no cursor: collection-cursor.ts).
 */

const SORT_IDS = SORTS.map((s) => s.id);
const NO_MEMBERSHIPS: Record<string, string[]> = {};
const VIEWS = ["shelf", "list"] as const;

/** Holding a title (18c) — Colecciones · transiciones §4: the sheet's
 *  spring at .4 in / .3 out (18 px, scale .97 are the hook's defaults). */
const HOLD_SHEET_MOTION = { enter: 0.4, exit: 0.3 } as const;

/** How many titles the client-windowed list shows, per collection — module
 *  memory, so coming back from a ficha finds the tile it left from. */
const windowOf = new Map<string, number>();

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
  /** Given = `items` is the first page only (see "colecciones largas"). */
  paging?: CollectionPaging;
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
  paging,
  now,
  others = [],
  memberships: seedMemberships = NO_MEMBERSHIPS,
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
  const [curated, setCurated] = useState<CuratedOrder | null>(null);
  const live = curated && curated.base === items ? curated : null;

  const pages = useCollectionPages({
    backlogId: backlog.id,
    seed: items,
    paging,
    seedMemberships,
    sort: owned ? sort : "manual",
    format,
  });
  const { remote, memberships } = pages;
  /** The server sorted and filtered these rows; the client only shows them. */
  const serverPaged = remote && owned && isPagedSort(sort);

  // What is loaded and still here (a deferred Quitar hides at once).
  const present = useMemo(() => {
    const kept = pages.rows.filter((it) => !hidden.has(it.backlogItemId));
    // A paged list is painted in its new order by `pages.paint`.
    return live && !remote ? arrange(kept, live.order) : kept;
  }, [pages.rows, hidden, live, remote]);

  // The fan reads the MANUAL order's first titles (+ the chosen cover, which
  // may live past the first page) — never the list on screen, which can be
  // another order or one format.
  const head = useMemo(() => {
    if (!remote) return present;
    const base = live?.head ?? (paging?.cover ? [paging.cover, ...items] : items);
    return base.filter((it) => !hidden.has(it.backlogItemId));
  }, [remote, present, live, paging, items, hidden]);
  const coverId = live ? live.cover : (backlog.coverCatalogItemId ?? null);
  const fan = fanOf(head, coverId);
  const hexes = fanHexes(fan, head);

  const counts = useMemo(() => {
    if (pages.counts) {
      // The server's aggregate, minus what a pending Quitar hid from THIS
      // list (rows and counts are one snapshot: use-collection-pages.ts).
      const c = { ...pages.counts };
      for (const it of pages.rows) {
        if (hidden.has(it.backlogItemId)) c[it.mediaType] = Math.max(0, c[it.mediaType] - 1);
      }
      return c;
    }
    const c: Record<MediaType, number> = { film: 0, series: 0, album: 0 };
    for (const it of present) c[it.mediaType] += 1;
    return c;
  }, [pages.counts, pages.rows, hidden, present]);
  const total = counts.film + counts.series + counts.album;
  // Pills in the order each format first appears (a paged collection knows
  // that from its manual head; a format further down follows in the canon's).
  const formats = useMemo(() => {
    const seen: MediaType[] = [];
    for (const it of head) if (!seen.includes(it.mediaType)) seen.push(it.mediaType);
    if (!remote) return seen;
    for (const k of MEDIA_TYPES) if (!seen.includes(k)) seen.push(k);
    return seen.filter((k) => counts[k] > 0);
  }, [head, remote, counts]);

  // A filter whose format emptied out (its last title left) lets go.
  if (format && counts[format] === 0 && !pages.loadingFirst) setFormat(null);
  const activeFormat = format && counts[format] > 0 ? format : null;
  const listed = useMemo(() => {
    if (serverPaged) return present;
    const base = activeFormat ? present.filter((it) => it.mediaType === activeFormat) : present;
    return owned ? sortItems(base, sort) : base;
  }, [present, activeFormat, sort, owned, serverPaged]);

  // The client's window over a list it holds whole.
  const [limit, setLimit] = useState(() => windowOf.get(backlog.id) ?? COLLECTION_PAGE_SIZE);
  const shown = useMemo(
    () => (serverPaged || listed.length <= limit ? listed : listed.slice(0, limit)),
    [serverPaged, listed, limit],
  );
  const hasMore = serverPaged ? pages.hasMore : listed.length > limit;
  const { loadMore } = pages;
  const more = () => {
    if (serverPaged) return loadMore();
    const next = limit + COLLECTION_PAGE_SIZE;
    windowOf.set(backlog.id, next);
    setLimit(next);
  };

  // 18c on every title; the automatic collection's is the reduced one (9b).
  const hold = (it: CollectionItem) => () => setSheet({ kind: "item", item: it });
  const addHref = `/descubrir?buscar=1&to=${backlog.id}`;

  const { remove, move, setCover, saveOrder, togglePin } = useCollectionMutations({
    backlog,
    items,
    present,
    coverId,
    memberships,
    show,
    setHidden,
    setCurated,
    setSort,
    setFormat,
    onFanChange,
    // A paged list keeps as many rows on screen as it had.
    paint: (next) => pages.paint(next.slice(0, Math.max(COLLECTION_PAGE_SIZE, pages.rows.length))),
    restore: pages.refresh,
  });

  /* -------------------------------------------------------------- render */

  const empty = total === 0;
  // A new order or format of a paged collection: its first page is coming.
  const pending = remote && pages.loadingFirst;
  const firstFailed = remote && pages.failed === "first";
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
          {pending ? (
            <RowsSkeleton view={view} label="Cargando títulos" />
          ) : view === "list" ? (
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
          <ListFooter
            view={view}
            // Auto-load only while nothing failed: a failure waits for its Reintentar.
            watch={hasMore && !pending && !pages.failed ? shown.length : null}
            onMore={more}
            loading={pages.loadingMore}
            failed={
              firstFailed
                ? "No pudimos cargar los títulos."
                : pages.failed === "more" || (pages.failed === "refresh" && pages.rows.length < total)
                  ? "No se cargó el resto."
                  : null
            }
            onRetry={pages.retry}
          />
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
              count={total}
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
          {sheet.kind === "reorder" &&
            (remote ? (
              <ReorderLoader load={pages.all} skip={hidden} onSave={saveOrder} />
            ) : (
              <ReorderBody items={present} onSave={(order) => saveOrder(order)} />
            ))}
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
            <DeleteBody backlogId={backlog.id} name={backlog.name} count={total} />
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
              current={{ id: backlog.id, name: backlog.name, fan, count: total }}
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
      // No `content-visibility` here: its paint containment clips the cover's
      // `shadow-cover` at the row's edge. Long collections mount by pages
      // instead (ronda 8 — see "colecciones largas" above).
      className="flex min-h-20 select-none items-center gap-3.5 transition-opacity active:opacity-70 [-webkit-touch-callout:none]"
    >
      <span className="flex w-[60px] flex-none justify-center">
        <span
          className="relative block overflow-hidden rounded-[var(--r-cover-s)] bg-surface-2 shadow-cover"
          style={{ width: w, height: h, ...(it.posterUrl ? null : posterFallbackStyle(it.paletteHex)) }}
        >
          {it.posterUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- hotlinked CDN (ADR-007)
            <img src={it.posterUrl} alt="" loading="lazy" decoding="async" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
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

/**
 * Under the titles (colecciones largas): the sentinel that asks for the next
 * page as the list's end comes within ~900 px of the viewport, the skeleton
 * of the rows on their way, and the failure with its Reintentar. The probe
 * is a tall box ending at the list's end rather than an observer margin: a
 * margin only grows the ROOT, and inside the profile's overlay the list
 * scrolls in its own box.
 */
function ListFooter({
  view,
  watch,
  onMore,
  loading,
  failed,
  onRetry,
}: {
  view: "shelf" | "list";
  /** Rows on screen while there is more to ask for; null = don't ask. */
  watch: number | null;
  onMore: () => void;
  loading: boolean;
  failed: string | null;
  onRetry: () => void;
}) {
  const probe = useRef<HTMLDivElement>(null);
  const ask = useRef(onMore);
  useEffect(() => {
    ask.current = onMore;
  });
  // Re-observed whenever the row count changes: a fresh observer reports the
  // current state at once, so a page that didn't fill the viewport asks again.
  useEffect(() => {
    const el = probe.current;
    if (watch === null || !el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) ask.current();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [watch]);

  return (
    <>
      <div aria-hidden className="relative h-px">
        <div ref={probe} className="pointer-events-none absolute inset-x-0 bottom-0 h-[900px]" />
      </div>
      {loading && <RowsSkeleton view={view} label="Cargando más títulos" />}
      {/* The region is always mounted (regla de la ronda 3). */}
      <div className={`flex flex-col items-center gap-3 px-6 text-center ${failed ? "pb-2 pt-4" : ""}`}>
        <p role="status" className="font-sans text-[14px] leading-[1.45] text-text-2 empty:hidden">
          {failed}
        </p>
        {failed && (
          <button type="button" onClick={onRetry} className={GLASS_BUTTON}>
            Reintentar
          </button>
        )}
      </div>
    </>
  );
}

/** The rows on their way, in the shape of the view (one run of three
 *  columns / three list rows) — `--s1`, the one pulse the system allows. */
function RowsSkeleton({ view, label }: { view: "shelf" | "list"; label: string }) {
  if (view === "list") {
    return (
      <div aria-busy="true" aria-label={label} className={`flex flex-col px-5 pt-2 ${SKELETON_PULSE}`}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex min-h-20 items-center gap-3.5">
            <span className="flex w-[60px] flex-none justify-center">
              <span className="block h-[66px] w-11 rounded-[var(--r-cover-s)] bg-surface-1" />
            </span>
            <span className="flex flex-1 flex-col gap-2">
              <span className="h-3.5 w-3/5 rounded-full bg-surface-1" />
              <span className="h-2.5 w-2/5 rounded-full bg-surface-1" />
            </span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div aria-busy="true" aria-label={label} className={`grid grid-cols-3 gap-x-3 px-5 ${SKELETON_PULSE}`}>
      {[0, 1, 2].map((i) => (
        <div key={i} className="mb-[18px] flex flex-col gap-1.5">
          <span className="aspect-[2/3] rounded-[var(--r-cover-l)] bg-surface-1" />
          <span className="flex h-4 items-center">
            <span className="h-3 w-4/5 rounded-full bg-surface-1" />
          </span>
        </div>
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

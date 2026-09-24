"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  deleteBacklogAction,
  createBacklogAction,
  type BacklogVisibility,
} from "@/app/actions/backlog-actions";
import {
  addItemAction,
  removeMembershipAction,
} from "@/app/actions/backlog-item-actions";
import { CoachNote, Sheet, SheetClose, useSheetDismiss } from "@/components/ui";
import { CHIP_44, Glyph, type GlyphKind } from "@/components/kura/components";
import { DotsIcon, KIcon, type KIconName } from "@/components/kura/icons";
import {
  ChoiceRow,
  MenuGap,
  MenuRow,
  RadioMark,
  SHEET_FIELD,
  SHEET_QUIET,
  SHEET_SOLID,
  SheetTitle,
} from "@/components/kura/sheet-parts";
import { releaseLabel, tintSurfaceVertical } from "@/components/kura/tint";
import { Toast, useToast } from "@/components/kura/toast";
import { useHold } from "@/components/kura/use-hold";
import { usePref } from "@/components/kura/use-pref";
import { posterFallbackStyle } from "@/components/cover-tile";
import type { MediaType } from "@/modules/catalog/types";
import {
  PrivacyBody,
  RenameBody,
  ShareBody,
  VISIBILITY_LABEL,
} from "../collection-forms";
import { ZoomBackButton } from "../zoom-back-button";

/**
 * Colección (Kura · flujos-v2 03–05, 2026-09-24).
 *
 * Header (x.label): a surface tinted by the chosen cover (180°, fused into
 * --bg), Volver and Opciones (44 glass at 64/24), the cover at 240 tall
 * centered, the name in Newsreader 24 and one pill per format — glyph +
 * count — that filters the body (tap again to clear).
 *
 * Body, by the frames' `adapt()` rule: GROUPED by format ("cine · N títulos",
 * a sideways row of 150 covers per group) when at least two formats are
 * shown and each has ≥ 3 titles; otherwise a SHELF (wrapping, 132 covers,
 * aligned to the base). "Ver como lista" (16c) swaps either for rows of 80.
 *
 * Every action lives in Opciones (18a) — one sheet whose content swaps
 * between its steps (never two sheets): Agregar títulos · Compartir · Ver
 * como lista · Ordenar · Renombrar · Privacidad · Borrar colección. Holding a
 * title (18c) opens its own sheet: Tu reacción · Reseñar · Mover a otra
 * colección · Quitar de la colección.
 *
 * OMITTED (the product has no data for them): Fijar, Cambiar portada / Usar
 * como portada (no chosen cover is persisted — the header uses the newest
 * title), and the manual order + its drag mode (O3a "Manual", O3b): no order
 * is persisted, so Ordenar offers Recientes · Título · Estado · Año, kept per
 * device like "ver como lista".
 *
 * Quitar is DEFERRED: the title hides at once and the write happens when its
 * "Deshacer" toast leaves — removing a title's LAST membership GC's its state
 * and review (removeMembershipAction), so undoing after the fact couldn't
 * bring those back. Mover writes at once (it adds before it removes, so the
 * state always survives) and its undo reverses exactly what it created.
 *
 * `mode="auto"` is the automatic collection "no puedo esperar" (37b): same
 * screen, the clock cover with "auto", no membership actions.
 */

export interface CollectionItem {
  backlogItemId: string;
  catalogItemId: string;
  title: string;
  byline: string | null;
  mediaType: MediaType;
  year: number | null;
  posterUrl: string | null;
  paletteHex: string[] | null;
  status: string;
  verdict: "liked" | "disliked" | null;
  obsessed: boolean;
  /** ISO or null. */
  releaseDate: string | null;
  /** ISO. */
  addedAt: string;
}

export interface OtherCollection {
  id: string;
  name: string;
  posterUrl: string | null;
  paletteHex: readonly string[] | null;
  mediaType: MediaType;
}

type Sort = "recent" | "title" | "state" | "year";
const SORTS: { id: Sort; label: string }[] = [
  { id: "recent", label: "Recientes" },
  { id: "title", label: "Título" },
  { id: "state", label: "Estado" },
  { id: "year", label: "Año" },
];
const SORT_IDS = SORTS.map((s) => s.id);
const VIEWS = ["shelf", "list"] as const;

const FORMAT: Record<MediaType, { icon: KIconName; plural: string; group: string; one: string }> = {
  film: { icon: "film", plural: "películas", group: "cine", one: "Cine" },
  series: { icon: "series", plural: "series", group: "series", one: "Serie" },
  album: { icon: "music", plural: "álbumes", group: "álbumes", one: "Álbum" },
};

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
    case "title":
      return out.sort((a, b) => a.title.localeCompare(b.title, "es", { sensitivity: "base" }));
    case "state":
      return out.sort((a, b) => stateRank(a) - stateRank(b));
    case "year":
      return out.sort((a, b) => (b.year ?? -Infinity) - (a.year ?? -Infinity));
    default:
      return out; // the loader's order: newest first
  }
}

/** Cover width at a height, by format (§forma). */
function widthAt(mediaType: MediaType, h: number): number {
  return mediaType === "album" ? h : Math.round((h * 2) / 3);
}

/** Top offsets of the frames (64 from the edge), respecting a taller safe area. */
const CHIP_TOP = "top-[max(64px,calc(20px+env(safe-area-inset-top)))]";
const HEADER_PAD = "pt-[max(124px,calc(80px+env(safe-area-inset-top)))]";

type SheetState =
  | { kind: "options" }
  | { kind: "sort" }
  | { kind: "rename" }
  | { kind: "privacy" }
  | { kind: "share" }
  | { kind: "delete" }
  | { kind: "item"; item: CollectionItem }
  | { kind: "move"; item: CollectionItem };

export function CollectionScreen({
  mode,
  backlog,
  items,
  now,
  others = [],
  memberships = {},
  username = null,
  profilePublic = false,
  coach = false,
  zoom = false,
}: {
  mode: "owned" | "auto";
  backlog: { id: string; name: string; vibe: string | null; visibility: BacklogVisibility };
  items: CollectionItem[];
  now: number;
  others?: OtherCollection[];
  memberships?: Record<string, string[]>;
  username?: string | null;
  profilePublic?: boolean;
  coach?: boolean;
  zoom?: boolean;
}) {
  const router = useRouter();
  const owned = mode === "owned";
  const [format, setFormat] = useState<MediaType | null>(null);
  const [view, setView] = usePref(`kura:col:${backlog.id}:view`, "shelf", VIEWS);
  const [sort, setSort] = usePref<Sort>(`kura:col:${backlog.id}:sort`, "recent", SORT_IDS);
  const [visibility, setVisibility] = useState(backlog.visibility);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const { toast, show, act } = useToast();
  const content = zoom ? "bl-zoom-content" : "";

  const present = useMemo(
    () => items.filter((it) => !hidden.has(it.backlogItemId)),
    [items, hidden],
  );
  // The chosen cover = the newest title (nothing persists a choice).
  const lead = present[0] ?? null;
  const leadHex =
    lead?.paletteHex?.length ? lead.paletteHex : (present.find((i) => i.paletteHex?.length)?.paletteHex ?? []);

  const counts = useMemo(() => {
    const c: Record<MediaType, number> = { film: 0, series: 0, album: 0 };
    for (const it of present) c[it.mediaType] += 1;
    return c;
  }, [present]);
  // Pills in the order each format first appears (the frames' groups order).
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

  const kindsShown = [...new Set(shown.map((it) => it.mediaType))];
  const grouped =
    kindsShown.length >= 2 &&
    kindsShown.every((k) => shown.filter((it) => it.mediaType === k).length >= 3);

  const hold = (it: CollectionItem) => (owned ? () => setSheet({ kind: "item", item: it }) : undefined);
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

  /* -------------------------------------------------------------- render */

  const empty = present.length === 0;

  return (
    <div className="relative mx-auto min-h-dvh w-full max-w-md overflow-x-clip pb-14 text-text">
      <div
        className="relative flex flex-col"
        style={{ background: !empty && leadHex.length ? tintSurfaceVertical(leadHex) : undefined }}
      >
        <div className={`absolute inset-x-6 ${CHIP_TOP} z-[2] flex items-center justify-between`}>
          <ZoomBackButton />
          <button
            type="button"
            aria-label="Opciones de la colección"
            onClick={() => setSheet({ kind: "options" })}
            className={CHIP_44}
          >
            <DotsIcon />
          </button>
        </div>

        <div className={`flex min-w-0 flex-col items-center gap-3 px-6 ${HEADER_PAD} ${empty ? "" : "pb-7"} ${content}`}>
          {mode === "auto" ? (
            <AutoCover />
          ) : empty ? (
            <Link
              href={addHref}
              aria-label={`Agregar a ${backlog.name}`}
              // Dashed mock affordance (exempt from the borderless rule).
              className="flex h-[240px] w-[160px] items-center justify-center rounded-[var(--r-cover-l)] border-[1.5px] border-dashed border-white/[0.18] bg-white/[0.03] text-text-2 bl-press"
            >
              <KIcon name="plus" size={26} />
            </Link>
          ) : (
            lead && <LeadCover it={lead} />
          )}
          <h1 className="mt-2 text-center font-brand text-[24px] font-normal leading-[1.05] [text-wrap:balance]">
            {backlog.name}
          </h1>
          {backlog.vibe && !empty && (
            <p className="-mt-1 max-w-[30ch] text-center font-sans text-[15px] leading-[1.45] text-text-2 [text-wrap:pretty]">
              {backlog.vibe}
            </p>
          )}
          {!empty && formats.length > 0 && (
            <div className="flex flex-wrap justify-center gap-1.5">
              {formats.map((k) => {
                const sel = activeFormat === k;
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
      </div>

      <div className={content}>
        {empty ? (
          <EmptyCollection addHref={addHref} auto={!owned} />
        ) : view === "list" ? (
          <ListBody items={shown} now={now} hold={hold} />
        ) : grouped ? (
          <GroupedBody items={shown} now={now} hold={hold} />
        ) : (
          <ShelfBody items={shown} now={now} hold={hold} />
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
            </span>
            Abre una portada para marcarla · mantenla presionada para moverla o quitarla.
          </CoachNote>
        )}
      </div>

      {sheet && (
        <Sheet
          onClose={() => setSheet(null)}
          label={sheetLabel(sheet, backlog.name)}
          pad={sheet.kind === "options" || sheet.kind === "item" ? "menu" : "form"}
        >
          {sheet.kind === "options" && (
            <OptionsBody
              owned={owned}
              view={view}
              sortLabel={SORTS.find((s) => s.id === sort)?.label ?? ""}
              visibilityLabel={VISIBILITY_LABEL[visibility]}
              addHref={addHref}
              onView={() => setView(view === "list" ? "shelf" : "list")}
              go={(kind) => setSheet({ kind })}
            />
          )}
          {sheet.kind === "sort" && <SortBody value={sort} onPick={setSort} />}
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
          {sheet.kind === "share" && (
            <ShareBody
              backlogId={backlog.id}
              name={backlog.name}
              count={present.length}
              covers={present}
              paletteHex={leadHex}
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
              onMove={() => setSheet({ kind: "move", item: sheet.item })}
              onRemove={() => remove(sheet.item)}
            />
          )}
          {sheet.kind === "move" && (
            <MoveBody
              it={sheet.item}
              current={backlog}
              others={others}
              already={memberships[sheet.item.catalogItemId] ?? []}
              onMove={(targets) => void move(sheet.item, targets)}
            />
          )}
        </Sheet>
      )}

      <Toast toast={toast} onAction={act} />
    </div>
  );
}

function sheetLabel(s: SheetState, name: string): string {
  switch (s.kind) {
    case "options":
      return `Opciones de ${name}`;
    case "sort":
      return "Ordenar";
    case "rename":
      return "Renombrar";
    case "privacy":
      return `Quién ve ${name}`;
    case "share":
      return "Compartir";
    case "delete":
      return "Borrar colección";
    case "item":
      return s.item.title;
    case "move":
      return "Mover a";
  }
}

/* --------------------------------------------------------------- header */

function LeadCover({ it }: { it: CollectionItem }) {
  return (
    <span
      role="img"
      aria-label={`Portada de ${it.title}`}
      className="relative block flex-none overflow-hidden rounded-[var(--r-cover-l)] bg-surface-2 shadow-cover"
      style={{
        height: 240,
        width: widthAt(it.mediaType, 240),
        ...(it.posterUrl ? null : posterFallbackStyle(it.paletteHex)),
      }}
    >
      {it.posterUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- hotlinked CDN (ADR-007)
        <img src={it.posterUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      )}
    </span>
  );
}

/** 37b — the automatic collection's cover: the clock on a slate square, "auto". */
function AutoCover() {
  return (
    <span
      role="img"
      aria-label="Portada de no puedo esperar"
      className="relative flex h-[240px] w-[240px] items-center justify-center overflow-hidden rounded-[var(--r-cover-l)] shadow-cover"
      style={{ background: "linear-gradient(160deg,#3a5a70 0%,#1c2a35 100%)" }}
    >
      <Glyph kind="waiting" size={96} />
      <span className="absolute bottom-3.5 left-4 font-mono text-[11px] uppercase tracking-[0.14em] text-text">
        auto
      </span>
    </span>
  );
}

/* ----------------------------------------------------------------- body */

function Tile({
  it,
  h,
  now,
  hold,
}: {
  it: CollectionItem;
  h: number;
  now: number;
  hold: (it: CollectionItem) => (() => void) | undefined;
}) {
  const onHold = hold(it);
  const { handlers } = useHold(onHold ?? (() => {}));
  const w = widthAt(it.mediaType, h);
  const wait = waitOf(it, now);
  const glyph = glyphOf(it);
  const sub = it.year ? String(it.year) : FORMAT[it.mediaType].one;
  return (
    <Link
      href={`/item/${it.catalogItemId}`}
      {...(onHold ? handlers : {})}
      className="flex flex-none select-none flex-col gap-[7px] bl-press [-webkit-touch-callout:none]"
    >
      <span
        className="relative block flex-none overflow-hidden rounded-[var(--r-cover-l)] bg-surface-2 shadow-cover"
        style={{ height: h, width: w, ...(it.posterUrl ? null : posterFallbackStyle(it.paletteHex)) }}
      >
        {it.posterUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- hotlinked CDN (ADR-007)
          <img
            src={it.posterUrl}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        {wait ? (
          <span
            role="img"
            aria-label={`No puedo esperar, ${wait}`}
            className="absolute left-1.5 top-1.5 z-[2] inline-flex h-[26px] items-center gap-[5px] rounded-full bg-glass-art pl-[7px] pr-[9px] font-mono text-[11px] uppercase leading-none tracking-[0.04em] text-text backdrop-blur-[14px]"
          >
            <Glyph kind="waiting" size={13} />
            {wait}
          </span>
        ) : glyph ? (
          <span
            role="img"
            aria-label={REACTION[glyph]}
            className="absolute left-1.5 top-1.5 z-[2] flex h-[26px] w-[26px] items-center justify-center rounded-full bg-glass-art backdrop-blur-[14px]"
          >
            <Glyph kind={glyph} size={13} />
          </span>
        ) : null}
      </span>
      <span className="truncate font-brand text-[14px] italic leading-[1.15] text-text" style={{ width: w }}>
        {it.title}
      </span>
      <span
        className="truncate font-mono text-[10px] uppercase tracking-[0.08em] text-text-2"
        style={{ width: w }}
      >
        {sub}
      </span>
    </Link>
  );
}

type BodyProps = {
  items: CollectionItem[];
  now: number;
  hold: (it: CollectionItem) => (() => void) | undefined;
};

function GroupedBody({ items, now, hold }: BodyProps) {
  const order: MediaType[] = [];
  for (const it of items) if (!order.includes(it.mediaType)) order.push(it.mediaType);
  return (
    <div className="flex flex-col gap-[30px] pt-[22px]">
      {order.map((k) => {
        const group = items.filter((it) => it.mediaType === k);
        return (
          <section key={k} className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between px-5">
              <h2 className="font-brand text-[24px] font-normal">{FORMAT[k].group}</h2>
              <span className="font-mono text-[12px] uppercase tracking-[0.08em] text-text-2">
                {group.length} {group.length === 1 ? "título" : "títulos"}
              </span>
            </div>
            <div className="bl-scroll flex items-end gap-3 overflow-x-auto px-5 pb-1">
              {group.map((it) => (
                <Tile key={it.backlogItemId} it={it} h={150} now={now} hold={hold} />
              ))}
              <span className="w-2 flex-none" />
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ShelfBody({ items, now, hold }: BodyProps) {
  return (
    <div className="flex flex-wrap items-end gap-x-3 gap-y-5 px-5 pt-6">
      {items.map((it) => (
        <Tile key={it.backlogItemId} it={it} h={132} now={now} hold={hold} />
      ))}
    </div>
  );
}

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
  const meta = [it.year, it.byline].filter(Boolean).join(" · ") || FORMAT[it.mediaType].one;
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

/** 15d — "colección nueva, repisa vacía." + the glass Agregar títulos. */
function EmptyCollection({ addHref, auto }: { addHref: string; auto: boolean }) {
  if (auto) {
    return (
      <div className="flex flex-col items-center gap-2.5 px-8 pt-10 text-center">
        <h2 className="font-brand text-[28px] font-normal leading-[1.1] [text-wrap:balance]">
          nada por estrenarse.
        </h2>
        <p className="font-sans text-[15px] leading-[1.5] text-text-2 [text-wrap:pretty]">
          Lo que guardes y todavía no salga aparece aquí solo, con cuánto falta.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-2.5 px-8 pt-10 text-center">
      <h2 className="font-brand text-[28px] font-normal leading-[1.1] [text-wrap:balance]">
        colección nueva, repisa vacía.
      </h2>
      <p className="font-sans text-[15px] leading-[1.5] text-text-2 [text-wrap:pretty]">
        Empieza por lo que no puedes dejar de recomendar.
      </p>
      <Link
        href={addHref}
        className="mt-4 inline-flex min-h-12 items-center gap-2 rounded-full bg-[var(--glass-bg)] pl-[18px] pr-[22px] font-sans text-[16px] font-semibold text-text bl-press"
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
  view,
  sortLabel,
  visibilityLabel,
  addHref,
  onView,
  go,
}: {
  owned: boolean;
  view: "shelf" | "list";
  sortLabel: string;
  visibilityLabel: string;
  addHref: string;
  onView: () => void;
  go: (kind: "sort" | "rename" | "privacy" | "share" | "delete") => void;
}) {
  const dismiss = useSheetDismiss();
  const viewRow = (
    <MenuRow
      icon={view === "list" ? "film" : "list"}
      label={view === "list" ? "Ver como repisa" : "Ver como lista"}
      onClick={() => {
        onView();
        dismiss?.();
      }}
    />
  );
  if (!owned) return <div className="flex flex-col gap-0.5">{viewRow}</div>;
  return (
    <div className="flex flex-col gap-0.5">
      <MenuRow icon="plus" label="Agregar títulos" href={addHref} />
      <MenuRow icon="share" label="Compartir" onClick={() => go("share")} />
      <MenuGap />
      {viewRow}
      <MenuRow icon="sort" label="Ordenar" aside={sortLabel} onClick={() => go("sort")} />
      <MenuRow icon="pencil" label="Renombrar" onClick={() => go("rename")} />
      <MenuRow icon="lock" label="Privacidad" aside={visibilityLabel} onClick={() => go("privacy")} />
      <MenuGap />
      <MenuRow icon="trash" label="Borrar colección" onClick={() => go("delete")} />
    </div>
  );
}

/** O3a — ordenar (Manual omitted: no order is persisted). */
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

/**
 * 35a — the ONE confirmation in this flow (it's irreversible). The copy is
 * the frame's, made exact: a title that lives in another collection keeps
 * its state there; this collection is what goes.
 */
function DeleteBody({ backlogId, name, count }: { backlogId: string; name: string; count: number }) {
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  return (
    <div role="alertdialog" aria-label="Borrar colección" className="flex flex-col gap-1.5 px-0">
      <h2 className="font-brand text-[26px] font-normal leading-[1.1] [text-wrap:balance]">
        ¿borrar {name}?
      </h2>
      <p className="pb-3.5 pt-1 font-sans text-[15px] leading-[1.5] text-text-2 [text-wrap:pretty]">
        {failed
          ? "No se pudo borrar. Revisa tu conexión e inténtalo otra vez."
          : count > 0
            ? `Sus ${count} ${count === 1 ? "título conserva su estado" : "títulos conservan su estado"} en tus otras colecciones. Solo se borra esta. No se puede deshacer.`
            : "Solo se borra esta. No se puede deshacer."}
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setFailed(false);
            try {
              await deleteBacklogAction(backlogId);
            } catch (err) {
              // redirect() can surface as a thrown NEXT_REDIRECT — that's success.
              const digest =
                err && typeof err === "object" && "digest" in err ? String(err.digest) : "";
              if (digest.startsWith("NEXT_REDIRECT")) return;
              setFailed(true);
            }
          })
        }
        className={SHEET_SOLID}
      >
        {pending ? "Borrando…" : "Borrar colección"}
      </button>
      <SheetClose className={SHEET_QUIET}>Cancelar</SheetClose>
    </div>
  );
}

/** 18c — holding a title. */
function ItemBody({
  it,
  onMove,
  onRemove,
}: {
  it: CollectionItem;
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
    </div>
  );
}

/** O4a — mover a (one or more collections; "Nueva colección" creates one inline). */
function MoveBody({
  it,
  current,
  others,
  already,
  onMove,
}: {
  it: CollectionItem;
  current: { id: string; name: string };
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
    const created: OtherCollection = {
      id,
      name: newName.trim(),
      posterUrl: null,
      paletteHex: null,
      mediaType: "film",
    };
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
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex min-h-14 items-center gap-3.5 text-left transition-opacity active:opacity-60"
        >
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[var(--r-cover-s)] bg-[var(--glass-bg)]">
            <KIcon name="plus" size={18} />
          </span>
          <span className="flex-1 font-sans text-[16px] font-medium text-text">Nueva colección</span>
        </button>
      )}

      {/* No inner scroller: the Sheet's own scroller (with its touch-action
          hook) carries a long list — a nested one would be pan-blocked by the
          panel's touch-none (learnings 2026-09-17). */}
      <div className="flex flex-col">
        <div className="flex min-h-14 items-center gap-3.5 opacity-45">
          <Thumb posterUrl={it.posterUrl} paletteHex={it.paletteHex} />
          <span className="min-w-0 flex-1 truncate font-brand text-[19px] text-text">{current.name}</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-2">aquí está</span>
          <RadioMark on />
        </div>
        {list.map((c) => {
          const there = already.includes(c.id);
          const on = there || picked.has(c.id);
          return (
            <button
              key={c.id}
              type="button"
              role="checkbox"
              aria-checked={on}
              disabled={there}
              onClick={() =>
                setPicked((p) => {
                  const n = new Set(p);
                  if (n.has(c.id)) n.delete(c.id);
                  else n.add(c.id);
                  return n;
                })
              }
              className={`flex min-h-14 items-center gap-3.5 text-left ${there ? "opacity-45" : ""}`}
            >
              <Thumb posterUrl={c.posterUrl} paletteHex={c.paletteHex} />
              <span className="min-w-0 flex-1 truncate font-brand text-[19px] text-text">{c.name}</span>
              {there && (
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-2">ya está</span>
              )}
              <RadioMark on={on} />
            </button>
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

function Thumb({
  posterUrl,
  paletteHex,
}: {
  posterUrl: string | null;
  paletteHex: readonly string[] | null;
}) {
  return (
    <span
      className="relative block h-10 w-10 flex-none overflow-hidden rounded-[var(--r-cover-s)] bg-surface-1"
      style={posterUrl ? undefined : paletteHex?.length ? posterFallbackStyle(paletteHex) : undefined}
    >
      {posterUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- hotlinked CDN (ADR-007)
        <img src={posterUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
      )}
    </span>
  );
}

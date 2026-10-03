import { attempt } from "@/components/kura/attempt";
import type { Dispatch, SetStateAction } from "react";
import { useRouter } from "next/navigation";
import {
  reorderBacklogItemsAction,
  setBacklogCoverAction,
  setBacklogPinnedAction,
} from "@/app/actions/backlog-actions";
import {
  addItemAction,
  removeMembershipAction,
} from "@/app/actions/backlog-item-actions";
import type { ToastSpec } from "@/components/kura/toast";
import type { CollectionItem, OtherCollection } from "@/modules/backlog/collection-item";
import { fanHexes, fanOf } from "@/modules/backlog/fan";
import type { MediaType } from "@/modules/catalog/types";
import type { Sort } from "./collection-shared";

/** Guardar orden, painted before the server answers (see collection-body). */
export interface CuratedOrder {
  base: CollectionItem[];
  order: string[];
  cover: string | null;
  /** Paged collections only: the first titles of the new order, for the fan
   *  (the body holds a page, not the collection). */
  head?: CollectionItem[];
}

/**
 * The titles still present in the manual order a Guardar orden just wrote
 * (backlogItemIds): titles that arrived meanwhile stay on top (unplaced
 * first, as `byManualOrder` reads them), gone ones drop out.
 */
export function arrange(items: CollectionItem[], order: readonly string[]): CollectionItem[] {
  const at = new Map(order.map((id, i) => [id, i]));
  const unplaced = items.filter((it) => !at.has(it.backlogItemId));
  const placed = items
    .filter((it) => at.has(it.backlogItemId))
    .sort((a, b) => at.get(a.backlogItemId)! - at.get(b.backlogItemId)!);
  return [...unplaced, ...placed];
}

/**
 * Every write of a collection's body (collection-body.tsx), in one place:
 * Quitar (deferred to its toast), Mover (adds before it removes; its undo
 * requires the way back to LAND before anything leaves), Usar como portada,
 * Guardar orden (optimistic) and Fijar. The body owns the state; the hook
 * gets its setters and says what happened through the body's toast (`show`).
 */
export function useCollectionMutations({
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
  paint,
  restore,
}: {
  backlog: { id: string; name: string; pinned?: boolean };
  items: CollectionItem[];
  present: CollectionItem[];
  coverId: string | null;
  memberships: Record<string, string[]>;
  show: (spec: ToastSpec) => void;
  setHidden: Dispatch<SetStateAction<Set<string>>>;
  setCurated: Dispatch<SetStateAction<CuratedOrder | null>>;
  setSort: (next: Sort) => void;
  setFormat: Dispatch<SetStateAction<MediaType | null>>;
  onFanChange?: (next: { fan: CollectionItem[]; hexes: string[] } | null) => void;
  /** Paged collections: paint the manual list in its new order / go back to
   *  the server's (use-collection-pages.ts). */
  paint?: (next: CollectionItem[]) => void;
  restore?: () => void;
}) {
  const router = useRouter();

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
          message: "No se pudo quitar.",
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
              // The way back in has to LAND before anything leaves: taking
              // out the memberships Mover created while this add was refused
              // would leave the title in none — and its last membership GC's
              // its state and review (removeMembershipAction).
              const res = await addItemAction({ backlogId: backlog.id, catalogItemId: it.catalogItemId });
              if (!("id" in res) || !res.id) throw new Error("undo failed");
              for (const id of created) await removeMembershipAction(id);
              router.refresh();
            } catch {
              show({ kind: "error", message: "No se pudo deshacer." });
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
        message: "No se pudo mover.",
        actionLabel: "Reintentar",
        onAction: () => void move(it, targets),
      });
    }
  }

  async function setCover(it: CollectionItem | null) {
    const res = await attempt(() => setBacklogCoverAction(backlog.id, it?.catalogItemId ?? null));
    if (!res.ok) {
      show({ kind: "error", message: "No se pudo cambiar la portada." });
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
   *
   * `all` is the WHOLE collection in the manual order, which a paged
   * collection reads when Reordenar opens (the body only holds pages);
   * without it, `present` already is the whole collection.
   */
  function saveOrder(order: string[], all?: CollectionItem[]) {
    setSort("manual");
    setFormat(null);
    const source = all ?? present;
    const next = arrange(source, order);
    if (next.every((it, i) => it.backlogItemId === source[i]?.backlogItemId)) return;
    const clearCover = coverId !== null && coverId !== next[0]?.catalogItemId;
    const cover = clearCover ? null : coverId;
    setCurated({ base: items, order, cover, head: all ? next.slice(0, 6) : undefined });
    if (all) paint?.(next);
    const fan = fanOf(next, cover);
    onFanChange?.({ fan, hexes: fanHexes(fan, next) });

    void (async () => {
      const res = await attempt(() => reorderBacklogItemsAction(backlog.id, order));
      if (!res.ok) {
        setCurated(null);
        onFanChange?.(null);
        if (all) restore?.();
        show({
          kind: "error",
          message: "No se pudo guardar el orden.",
          actionLabel: "Reintentar",
          onAction: () => saveOrder(order, all),
        });
        return;
      }
      if (clearCover) {
        const c = await attempt(() => setBacklogCoverAction(backlog.id, null));
        if (!c.ok) show({ kind: "error", message: "No se pudo cambiar la portada." });
      }
      // The painted list has no cursor: re-read it now that the order landed.
      if (all) restore?.();
      router.refresh();
    })();
  }

  async function togglePin() {
    const pinned = !backlog.pinned;
    const res = await attempt(() => setBacklogPinnedAction(backlog.id, pinned));
    if (!res.ok) {
      show({ kind: "error", message: "No se pudo guardar." });
      return;
    }
    router.refresh();
    show({ message: pinned ? "Fijada" : "Ya no está fijada" });
  }

  return { remove, move, setCover, saveOrder, togglePin };
}

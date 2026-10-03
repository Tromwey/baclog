import { useCallback, useEffect, useState } from "react";
import {
  getCollectionAllAction,
  getCollectionPageAction,
} from "@/app/actions/collection-page-actions";
import { attempt } from "@/components/kura/attempt";
import type { CollectionItem } from "@/modules/backlog/collection-item";
import type { MediaType } from "@/modules/catalog/types";
import {
  COLLECTION_PAGE_SIZE,
  COLLECTION_WINDOW_MAX,
  isPagedSort,
  type PagedSort,
} from "@/modules/backlog/collection-cursor";
import type { Sort } from "./collection-shared";

/**
 * Colecciones largas (founder, ronda 8): the collection's titles by pages of
 * 60 as the page scrolls. The FIRST page comes with the RSC (`seed`, always
 * in the manual order, plus `paging`); everything after it through
 * `getCollectionPageAction`, which re-authorizes every call.
 *
 * ONE list per (order, format) — the `key`. Changing order or format is a
 * different list read from its own first page (a cursor is refused outside
 * the order that made it), not a re-sort of what happens to be loaded:
 * sorting 60 of 400 rows by year would show the wrong 60.
 *
 *  - `manual` · `recent` · `state` · `year`: keyset pages from the server.
 *  - `title`: no cursor (collection-cursor.ts says why) — the whole
 *    collection is read once (`getCollectionAllAction`) and the body sorts
 *    and windows it in the client, as it always did.
 *
 * What keeps the list honest while things change under it:
 *  - A page that arrives is appended WITHOUT the rows already on screen (a
 *    title that a mutation pushed across the page boundary is not repeated).
 *  - `router.refresh()` after a write brings a new `seed`. When it SAYS
 *    something new (first page or counts changed — `sigOf`), the list
 *    re-reads everything it shows from the start in ONE call (up to 600
 *    rows) and swaps it in when it lands — the old rows stay until then, so
 *    nothing collapses under the reader. A response for a list that changed
 *    meanwhile is dropped (`req` identity). A write that can change the list
 *    WITHOUT changing the first page or the counts (a reorder further down)
 *    asks for that re-read itself (`refresh`).
 *  - Every answer carries the counts per format, stored WITH its rows: the
 *    pills and "N títulos" never mix a new total with an old list.
 *
 * Coming back from a ficha remounts this body (the cover flies back to its
 * tile, the scroll is restored): `cache` remembers, per collection and key,
 * the rows already loaded in this tab, so the tile is there to land on. What
 * it restores is then re-read like after any refresh. Module memory only —
 * empty on a hard load, so server and first client render agree.
 */

export interface CollectionPaging {
  /** Titles per format in the whole collection (server aggregate). */
  counts: Record<MediaType, number>;
  /** After the seed page, in the manual order; null = the seed is all of it. */
  nextCursor: string | null;
  /** The chosen cover when it lives past the seed page (the fan needs it). */
  cover: CollectionItem | null;
}

interface Slot {
  items: CollectionItem[];
  next: string | null;
  counts: Record<MediaType, number>;
  memberships: Record<string, string[]>;
}

type Kind = "first" | "refresh" | "more";

interface Request {
  kind: Kind;
  /** null = the whole collection (the "Título" order). */
  sort: PagedSort | null;
  format: MediaType | null;
  cursor: string | null;
  limit: number;
}

interface State extends Slot {
  key: string;
  /** The seed this list last reconciled with: its identity, and what it
   *  SAID (`sigOf`) — only a seed that says something new re-reads the list. */
  seed: CollectionItem[];
  sig: string;
  req: Request | null;
  failed: Kind | null;
}

const SEED_KEY = "manual|";
const cache = new Map<string, Slot>();
const CACHE_MAX = 12;

function remember(id: string, slot: Slot) {
  cache.delete(id);
  cache.set(id, slot);
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

function keyOf(sort: Sort, format: MediaType | null): string {
  // "Título" sorts and filters in the client: one list whatever the format.
  return isPagedSort(sort) ? `${sort}|${format ?? ""}` : "title|";
}

function partsOf(key: string): Pick<Request, "sort" | "format"> {
  const [sort, format] = key.split("|");
  return isPagedSort(sort)
    ? { sort, format: (format || null) as MediaType | null }
    : { sort: null, format: null };
}

function refreshOf(key: string, shown: number): Request {
  return {
    kind: "refresh",
    ...partsOf(key),
    cursor: null,
    limit: Math.min(COLLECTION_WINDOW_MAX, Math.max(COLLECTION_PAGE_SIZE, shown)),
  };
}

/**
 * What a seed says. A re-render of the page hands a NEW array with the same
 * content (any server action that touches the session cookie re-renders the
 * route — including this list's own page reads), and re-reading the list on
 * identity alone would turn each read into the next one's trigger.
 */
function sigOf(seed: CollectionItem[], paging: CollectionPaging): string {
  return JSON.stringify([seed, paging.counts, paging.nextCursor]);
}

/** The list a key starts with: what this tab already loaded for it, the
 *  seed (manual order only), or nothing yet. */
function enter(
  backlogId: string,
  key: string,
  seed: CollectionItem[],
  paging: CollectionPaging,
  seedMemberships: Record<string, string[]>,
  prev: Slot | null,
): State {
  const cached = cache.get(`${backlogId}|${key}`);
  const sig = sigOf(seed, paging);
  if (key === SEED_KEY) {
    if (cached && cached.items.length > seed.length) {
      // The server's first page is newer than what was remembered: it leads,
      // and the remembered rows beyond it stay until the re-read lands.
      const fresh = new Set(seed.map((it) => it.backlogItemId));
      const items = [...seed, ...cached.items.filter((it) => !fresh.has(it.backlogItemId))];
      return {
        key,
        seed,
        sig,
        items,
        next: cached.next,
        counts: paging.counts,
        memberships: { ...cached.memberships, ...seedMemberships },
        req: refreshOf(key, items.length),
        failed: null,
      };
    }
    return {
      key,
      seed,
      sig,
      items: seed,
      next: paging.nextCursor,
      counts: paging.counts,
      memberships: seedMemberships,
      req: null,
      failed: null,
    };
  }
  if (cached) return { key, seed, sig, ...cached, req: refreshOf(key, cached.items.length), failed: null };
  return {
    key,
    seed,
    sig,
    items: [],
    next: null,
    counts: prev?.counts ?? paging.counts,
    memberships: prev?.memberships ?? seedMemberships,
    req: { kind: "first", ...partsOf(key), cursor: null, limit: COLLECTION_PAGE_SIZE },
    failed: null,
  };
}

const NO_PAGING: CollectionPaging = { counts: { film: 0, series: 0, album: 0 }, nextCursor: null, cover: null };

export function useCollectionPages({
  backlogId,
  seed,
  paging,
  seedMemberships,
  sort,
  format,
}: {
  backlogId: string;
  seed: CollectionItem[];
  /** Absent = the caller holds the whole collection (Tus colecciones, the
   *  automatic one): nothing is fetched and `rows` is `seed`. */
  paging?: CollectionPaging;
  seedMemberships: Record<string, string[]>;
  sort: Sort;
  format: MediaType | null;
}) {
  const remote = paging !== undefined;
  const key = remote ? keyOf(sort, format) : SEED_KEY;
  const [stored, setState] = useState<State>(() =>
    enter(backlogId, key, seed, paging ?? NO_PAGING, seedMemberships, null),
  );

  // Derived during render (no effect): a new order/format is another list,
  // and a new seed (router.refresh) re-reads the one on screen.
  let state = stored;
  if (remote && state.key !== key) {
    state = enter(backlogId, key, seed, paging, seedMemberships, state);
    setState(state);
  } else if (remote && state.seed !== seed) {
    const sig = sigOf(seed, paging);
    if (sig === state.sig) {
      // Same content, new array: nothing to re-read.
      state = { ...state, seed };
    } else if (key === SEED_KEY && state.items.length <= COLLECTION_PAGE_SIZE) {
      // Nothing beyond the first page was loaded: the seed IS the list.
      state = {
        key,
        seed,
        sig,
        items: seed,
        next: paging.nextCursor,
        counts: paging.counts,
        memberships: seedMemberships,
        req: null,
        failed: null,
      };
    } else {
      state = { ...state, seed, sig, req: refreshOf(key, state.items.length), failed: null };
    }
    setState(state);
  }

  const { req } = state;
  useEffect(() => {
    if (!req) return;
    let live = true;
    void (async () => {
      const res = await attempt(() =>
        req.sort === null
          ? getCollectionAllAction(backlogId)
          : getCollectionPageAction({
              backlogId,
              sort: req.sort,
              format: req.format,
              cursor: req.cursor,
              limit: req.limit,
            }),
      );
      if (!live) return;
      setState((prev) => {
        // The list moved on (another order, a newer refresh): drop this answer.
        if (prev.req !== req) return prev;
        if (!res.ok) return { ...prev, req: null, failed: req.kind };
        const page = res.value;
        if (req.kind !== "more") {
          return {
            ...prev,
            items: page.items,
            next: page.nextCursor,
            counts: page.counts,
            memberships: { ...prev.memberships, ...page.memberships },
            req: null,
            failed: null,
          };
        }
        const have = new Set(prev.items.map((it) => it.backlogItemId));
        return {
          ...prev,
          items: [...prev.items, ...page.items.filter((it) => !have.has(it.backlogItemId))],
          next: page.nextCursor,
          counts: page.counts,
          memberships: { ...prev.memberships, ...page.memberships },
          req: null,
          failed: null,
        };
      });
    })();
    return () => {
      live = false;
    };
  }, [req, backlogId]);

  // What settled is what a remount (back from a ficha) starts from.
  useEffect(() => {
    if (!remote || stored.req || stored.failed) return;
    remember(`${backlogId}|${stored.key}`, {
      items: stored.items,
      next: stored.next,
      counts: stored.counts,
      memberships: stored.memberships,
    });
  }, [remote, backlogId, stored]);

  const loadMore = useCallback(() => {
    setState((prev) =>
      prev.req || !prev.next
        ? prev
        : {
            ...prev,
            failed: null,
            req: { kind: "more", ...partsOf(prev.key), cursor: prev.next, limit: COLLECTION_PAGE_SIZE },
          },
    );
  }, []);

  /** Re-read what is on screen from the start (also the way back from a
   *  failed first page or a failed re-read). */
  const refresh = useCallback(() => {
    setState((prev) => ({
      ...prev,
      failed: null,
      req:
        prev.items.length === 0
          ? { kind: "first", ...partsOf(prev.key), cursor: null, limit: COLLECTION_PAGE_SIZE }
          : refreshOf(prev.key, prev.items.length),
    }));
  }, []);

  const retry = useCallback(() => {
    setState((prev) => {
      if (prev.req || !prev.failed) return prev;
      if (prev.failed === "more" && prev.next) {
        return {
          ...prev,
          failed: null,
          req: { kind: "more", ...partsOf(prev.key), cursor: prev.next, limit: COLLECTION_PAGE_SIZE },
        };
      }
      return {
        ...prev,
        failed: null,
        req:
          prev.items.length === 0
            ? { kind: "first", ...partsOf(prev.key), cursor: null, limit: COLLECTION_PAGE_SIZE }
            : refreshOf(prev.key, prev.items.length),
      };
    });
  }, []);

  /**
   * Guardar orden, painted before the server answers: the manual list
   * becomes these rows. No cursor until the write lands and the refresh that
   * follows re-reads it — a page asked for now would use the OLD positions.
   */
  const paint = useCallback((items: CollectionItem[]) => {
    setState((prev) => ({ ...prev, key: SEED_KEY, items, next: null, req: null, failed: null }));
  }, []);

  /** The whole collection in the manual order (Reordenar). */
  const all = useCallback(() => attempt(() => getCollectionAllAction(backlogId)), [backlogId]);

  return {
    remote,
    /** Loaded so far for this order/format (local: everything). */
    rows: remote ? state.items : seed,
    counts: remote ? state.counts : null,
    memberships: remote ? state.memberships : seedMemberships,
    /** A first page (new order/format) is on its way: nothing to show yet. */
    loadingFirst: remote && state.req?.kind === "first",
    loadingMore: remote && state.req?.kind === "more",
    failed: remote ? state.failed : null,
    hasMore: remote && state.next !== null,
    loadMore,
    refresh,
    retry,
    paint,
    all,
  };
}

export type CollectionPages = ReturnType<typeof useCollectionPages>;

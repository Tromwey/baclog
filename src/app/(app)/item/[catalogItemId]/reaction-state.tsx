"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createBacklogAction } from "@/app/actions/backlog-actions";
import {
  addItemAction,
  clearVerdictAction,
  removeFromLibraryAction,
  setObsessedAction,
  setVerdictAction,
} from "@/app/actions/backlog-item-actions";
import { setMembershipAction } from "@/app/actions/complete-actions";
import { useToast, type ToastHost } from "@/components/kura/toast";
import { extractPalette } from "@/modules/cards/palette";
import type { OwnReview } from "@/modules/reviews/types";
import type { CollectionsIndex } from "./collections-index";

/**
 * The ficha's shared client state (Kura 24a–d, 26a, 37a, C4 — 2026-09-24).
 *
 * Reaction is TWO INDEPENDENT axes (F3.7): a `verdict` and an `obsessed` flag;
 * completion is a third. Each axis runs through `useOptimisticAxis` — its own
 * state, ref and compare-before-revert guard — so a failed write never
 * clobbers a newer optimistic one. In Kura the only way to react is the
 * Completar slider (Completo → Me gusta → Me obsesiona), which writes all
 * three in one server call and mirrors them here with `settleFromComplete`.
 *
 * The provider also owns:
 *  - MEMBERSHIP. `memberIds` drives "Guardar"/"En N colecciones", the "en tus
 *    colecciones" pills and the "guardar en" sheet without a round-trip. The
 *    sheet is STAGED (check what you want, then Guardar) — `commitMemberships`
 *    diffs and writes, adds before removes so a move never passes through zero
 *    (which would GC the per-title state on the server).
 *  - The viewer's OWN review (Completar writes it, the reviews block shows it).
 *  - Which sheet is open. "Nunca dos hojas a la vez": Completar, guardar en
 *    and Opciones are mutually exclusive, EXCEPT that Completar on a title that
 *    isn't saved yet asks "guardar en" (pick mode) and stays mounted, hidden,
 *    until the pick resolves.
 *  - The one toast ("Deshacer" / "Reintentar", one at a time) — the shared
 *    `kura/toast` host, so its clock pauses like every other toast's.
 *  - "Quitar de tus colecciones" with a real Deshacer: the page goes dark at
 *    once, the write waits out the TOAST (its `onExpire` commits — so a
 *    paused toast never leaves a Deshacer on screen for a write that already
 *    happened) and is flushed early by any other membership write, or on
 *    unmount.
 *
 * Nothing here calls router.refresh() on add: the provider is keyed on the
 * entry id in page.tsx, and a refresh that swaps `none → id` would remount
 * this tree mid-flow and drop an open sheet
 * (learnings/2026-09-02-revalidatepath-cambia-props-bajo-estado-cliente).
 */

export type ItemVerdictValue = "disliked" | "liked" | null;

export interface BacklogOption {
  id: string;
  name: string;
}

type ActionResult = { ok: true } | { error: string };

function useOptimisticAxis<T>(
  catalogItemId: string,
  enabledRef: React.RefObject<boolean>,
  initial: T,
  persist: (id: string, next: T) => Promise<ActionResult>,
): [T, (next: T) => Promise<boolean>, (next: T) => void] {
  const [value, setValue] = useState<T>(initial);
  const ref = useRef<T>(initial);

  const mutate = useCallback(
    async (next: T): Promise<boolean> => {
      if (!enabledRef.current) return false;
      const prev = ref.current;
      ref.current = next;
      setValue(next);
      const revert = () => {
        if (ref.current === next) ref.current = prev;
        setValue((current) => (current === next ? prev : current));
      };
      try {
        const res = await persist(catalogItemId, next);
        if ("error" in res) {
          revert();
          return false;
        }
        return true;
      } catch {
        revert();
        return false;
      }
    },
    [catalogItemId, enabledRef, persist],
  );

  const settle = useCallback((next: T) => {
    ref.current = next;
    setValue(next);
  }, []);

  return [value, mutate, settle];
}

const persistVerdict = (id: string, next: ItemVerdictValue): Promise<ActionResult> =>
  next === null ? clearVerdictAction(id) : setVerdictAction(id, next);
const persistObsessed = (id: string, next: boolean): Promise<ActionResult> =>
  setObsessedAction(id, next);
const persistNothing = async (): Promise<ActionResult> => ({ ok: true });

export type SaveSheetMode = "manage" | "pick" | null;

export interface ToastAction {
  /** "Deshacer" for the reversible, "Reintentar" (with the triangle) for failures. */
  label: string;
  run: () => void;
  failure?: boolean;
  /** Runs when the toast leaves WITHOUT `run` — the deferred commit. */
  expire?: () => void;
}

interface ItemReactionState {
  catalogItemId: string;
  inLibrary: boolean;
  memberIds: readonly string[];
  backlogs: readonly BacklogOption[];
  collections: CollectionsIndex;
  verdict: ItemVerdictValue;
  obsessed: boolean;
  completed: boolean;
  mutateVerdict: (next: ItemVerdictValue) => Promise<boolean>;
  mutateObsessed: (next: boolean) => Promise<boolean>;
  /** Mirror a write the Completar sheet already made on the server. */
  settleFromComplete: (next: {
    verdict: ItemVerdictValue;
    obsessed: boolean;
    completed: boolean;
  }) => void;
  /**
   * Make sure the title is in the library before completing: already there →
   * true; one collection → adds straight to it; several → "guardar en" in pick
   * mode (last used pre-checked), resolving when the user saved (false if they
   * dismissed it).
   */
  ensureInLibrary: () => Promise<boolean>;
  saveSheet: SaveSheetMode;
  openSave: () => void;
  closeSave: () => void;
  /** Write the staged selection of the "guardar en" sheet. */
  commitMemberships: (ids: string[]) => Promise<boolean>;
  createCollection: (name: string) => Promise<BacklogOption | null>;
  busy: boolean;
  ownReview: OwnReview | null;
  setOwnReview: (next: OwnReview | null) => void;
  /** The review's own sheets (edit / its ⋯ menu), opened from the block or Reseñar. */
  reviewSheet: "edit" | "menu" | null;
  setReviewSheet: (next: "edit" | "menu" | null) => void;
  completeOpen: boolean;
  openComplete: () => void;
  closeComplete: () => void;
  optionsOpen: boolean;
  openOptions: () => void;
  closeOptions: () => void;
  recoHidden: boolean;
  setRecoHidden: (hidden: boolean) => void;
  toastHost: ToastHost;
  showToast: (text: string, action?: ToastAction) => void;
  clearToast: () => void;
  /** "Quitar de tus colecciones" — optimistic, with a 5 s Deshacer. */
  removeFromLibrary: () => void;
}

const Ctx = createContext<ItemReactionState | null>(null);

export function ItemReactionProvider({
  catalogItemId,
  posterUrl,
  paletteHex,
  backlogs: initialBacklogs,
  collections,
  initialMemberIds,
  initialVerdict,
  initialObsessed,
  initialCompleted,
  initialOwnReview,
  children,
}: {
  catalogItemId: string;
  posterUrl: string | null;
  /** Cached cover palette (catalog_item) — present ⇒ skip on-device extraction on add. */
  paletteHex: string[] | null;
  backlogs: BacklogOption[];
  collections: CollectionsIndex;
  /** Empty ⇒ not in the library. */
  initialMemberIds: string[];
  initialVerdict: ItemVerdictValue;
  initialObsessed: boolean;
  initialCompleted: boolean;
  initialOwnReview: OwnReview | null;
  children: ReactNode;
}) {
  const [memberIds, setMemberIdsState] = useState<string[]>(initialMemberIds);
  const [backlogs, setBacklogs] = useState<BacklogOption[]>(initialBacklogs);
  const inLibrary = memberIds.length > 0;
  // Read by the axes at mutate time; every writer of memberIds goes through
  // setMemberIds below, which keeps it in step (never during render).
  const inLibraryRef = useRef(inLibrary);
  const memberRef = useRef<string[]>(initialMemberIds);
  const setMemberIds = useCallback((ids: string[]) => {
    memberRef.current = ids;
    inLibraryRef.current = ids.length > 0;
    setMemberIdsState(ids);
  }, []);

  const [verdict, mutateVerdict, settleVerdict] = useOptimisticAxis<ItemVerdictValue>(
    catalogItemId,
    inLibraryRef,
    initialVerdict,
    persistVerdict,
  );
  const [obsessed, mutateObsessed, settleObsessed] = useOptimisticAxis<boolean>(
    catalogItemId,
    inLibraryRef,
    initialObsessed,
    persistObsessed,
  );
  const [completed, , settleCompleted] = useOptimisticAxis<boolean>(
    catalogItemId,
    inLibraryRef,
    initialCompleted,
    persistNothing,
  );

  const [ownReview, setOwnReview] = useState<OwnReview | null>(initialOwnReview);
  const [reviewSheet, setReviewSheet] = useState<"edit" | "menu" | null>(null);
  const [recoHidden, setRecoHidden] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [saveSheet, setSaveSheet] = useState<SaveSheetMode>(null);
  const [busy, setBusy] = useState(false);
  const toastHost = useToast();
  const { show: showHostToast, dismiss: clearToast } = toastHost;
  const pendingPick = useRef<((ok: boolean) => void) | null>(null);

  const showToast = useCallback(
    (text: string, action?: ToastAction) =>
      showHostToast({
        message: text,
        kind: action?.failure ? "error" : action ? "undo" : undefined,
        actionLabel: action?.label,
        onAction: action?.run,
        onExpire: action?.expire,
      }),
    [showHostToast],
  );

  // Palette is cover-derived + cached on catalog_item; extract on-device only
  // when this title has none yet ([] on CORS failure). Once per visit.
  const needsPalette = !paletteHex || paletteHex.length === 0;
  const extracted = useRef<Promise<string[] | undefined> | null>(null);
  const paletteFor = useCallback(() => {
    if (!needsPalette || !posterUrl) return Promise.resolve(undefined);
    extracted.current ??= extractPalette(posterUrl)
      .then((hex) => (hex.length > 0 ? hex : undefined))
      .catch(() => undefined);
    return extracted.current;
  }, [needsPalette, posterUrl]);

  /* ---------------------------------------------- quitar, con Deshacer */

  // Latest `removeFromLibrary`, for the Reintentar and the uncheck-all path
  // (both run later, from closures made before the latest render).
  const removeFromLibraryRef = useRef<() => void>(() => {});
  const pendingRemoval = useRef<{ commit: () => Promise<void> } | null>(null);

  const clearLocalState = useCallback(() => {
    setMemberIds([]);
    settleVerdict(null);
    settleObsessed(false);
    settleCompleted(false);
    setOwnReview(null);
  }, [setMemberIds, settleCompleted, settleObsessed, settleVerdict]);

  const flushRemoval = useCallback(async () => {
    const pending = pendingRemoval.current;
    if (!pending) return;
    await pending.commit();
  }, []);

  const removeFromLibrary = useCallback(() => {
    if (pendingRemoval.current || memberRef.current.length === 0) return;
    const snapshot = {
      memberIds: memberRef.current,
      verdict,
      obsessed,
      completed,
      ownReview,
    };
    const restore = () => {
      setMemberIds(snapshot.memberIds);
      settleVerdict(snapshot.verdict);
      settleObsessed(snapshot.obsessed);
      settleCompleted(snapshot.completed);
      setOwnReview(snapshot.ownReview);
    };
    const commit = async () => {
      pendingRemoval.current = null;
      try {
        await removeFromLibraryAction(catalogItemId);
      } catch {
        restore();
        showToast("No se pudo quitar de tus colecciones.", {
          label: "Reintentar",
          failure: true,
          run: () => removeFromLibraryRef.current(),
        });
      }
    };
    clearLocalState();
    const entry = { commit };
    pendingRemoval.current = entry;
    showToast("Ya no está en tus colecciones.", {
      label: "Deshacer",
      run: () => {
        // Already flushed by another membership write: nothing to take back.
        if (pendingRemoval.current !== entry) return;
        pendingRemoval.current = null;
        restore();
      },
      expire: () => {
        if (pendingRemoval.current === entry) void commit();
      },
    });
  }, [
    catalogItemId,
    clearLocalState,
    completed,
    obsessed,
    ownReview,
    setMemberIds,
    settleCompleted,
    settleObsessed,
    settleVerdict,
    showToast,
    verdict,
  ]);
  useEffect(() => {
    removeFromLibraryRef.current = removeFromLibrary;
  });

  // Leaving the ficha inside the Deshacer window still removes: the toast
  // promised it. Fire-and-forget — the action revalidates /backlogs itself.
  useEffect(
    () => () => {
      const pending = pendingRemoval.current;
      if (!pending) return;
      void pending.commit();
    },
    [],
  );

  /* ------------------------------------------------------ membresía */

  const addTo = useCallback(
    async (backlogId: string): Promise<boolean> => {
      setBusy(true);
      try {
        const res = await addItemAction({
          backlogId,
          catalogItemId,
          paletteHex: await paletteFor(),
        });
        if (!("id" in res)) return false;
        const ids = memberRef.current;
        setMemberIds(ids.includes(backlogId) ? ids : [...ids, backlogId]);
        return true;
      } catch {
        return false;
      } finally {
        setBusy(false);
      }
    },
    [catalogItemId, paletteFor, setMemberIds],
  );

  const resolvePick = useCallback((ok: boolean) => {
    pendingPick.current?.(ok);
    pendingPick.current = null;
  }, []);

  const ensureInLibrary = useCallback(async (): Promise<boolean> => {
    await flushRemoval();
    if (inLibraryRef.current) return true;
    if (backlogs.length === 1) return addTo(backlogs[0].id);
    return new Promise<boolean>((resolve) => {
      resolvePick(false); // a stale waiter, if any, is told no
      pendingPick.current = resolve;
      setOptionsOpen(false);
      setSaveSheet("pick");
    });
  }, [addTo, backlogs, flushRemoval, resolvePick]);

  const closeSave = useCallback(() => {
    setSaveSheet(null);
    resolvePick(false);
  }, [resolvePick]);

  const commitMemberships = useCallback(
    async (ids: string[]): Promise<boolean> => {
      await flushRemoval();
      const before = memberRef.current;
      // Unchecking everything IS "quitar de tus colecciones": same Deshacer.
      if (ids.length === 0 && before.length > 0) {
        removeFromLibraryRef.current();
        return true;
      }
      const adds = ids.filter((id) => !before.includes(id));
      const removes = before.filter((id) => !ids.includes(id));
      let current = before;
      setBusy(true);
      try {
        const palette = adds.length > 0 ? await paletteFor() : undefined;
        // Adds first: a move between collections never passes through zero.
        for (const backlogId of adds) {
          const res = await setMembershipAction({ backlogId, catalogItemId, member: true, paletteHex: palette });
          if ("error" in res) throw new Error(res.error);
          current = [...current, backlogId];
          setMemberIds(current);
        }
        for (const backlogId of removes) {
          const res = await setMembershipAction({ backlogId, catalogItemId, member: false });
          if ("error" in res) throw new Error(res.error);
          current = current.filter((id) => id !== backlogId);
          setMemberIds(current);
        }
        if (pendingPick.current) resolvePick(current.length > 0);
        return true;
      } catch {
        return false;
      } finally {
        setBusy(false);
      }
    },
    [catalogItemId, flushRemoval, paletteFor, resolvePick, setMemberIds],
  );

  const createCollection = useCallback(async (name: string): Promise<BacklogOption | null> => {
    setBusy(true);
    try {
      const res = await createBacklogAction({ name });
      if (!("id" in res) || !res.id) return null;
      const made = { id: res.id, name };
      setBacklogs((list) => [made, ...list]);
      return made;
    } catch {
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  const settleFromComplete = useCallback(
    (next: { verdict: ItemVerdictValue; obsessed: boolean; completed: boolean }) => {
      settleVerdict(next.verdict);
      settleObsessed(next.obsessed);
      settleCompleted(next.completed);
    },
    [settleCompleted, settleObsessed, settleVerdict],
  );

  return (
    <Ctx.Provider
      value={{
        catalogItemId,
        inLibrary,
        memberIds,
        backlogs,
        collections,
        verdict,
        obsessed,
        completed,
        mutateVerdict,
        mutateObsessed,
        settleFromComplete,
        ensureInLibrary,
        saveSheet,
        openSave: () => {
          setOptionsOpen(false);
          setSaveSheet("manage");
        },
        closeSave,
        commitMemberships,
        createCollection,
        busy,
        ownReview,
        setOwnReview,
        reviewSheet,
        setReviewSheet,
        completeOpen,
        openComplete: () => {
          setOptionsOpen(false);
          setCompleteOpen(true);
        },
        closeComplete: () => setCompleteOpen(false),
        optionsOpen,
        openOptions: () => setOptionsOpen(true),
        closeOptions: () => setOptionsOpen(false),
        recoHidden,
        setRecoHidden,
        toastHost,
        showToast,
        clearToast,
        removeFromLibrary,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useItemReaction(): ItemReactionState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useItemReaction must be used inside ItemReactionProvider");
  return ctx;
}

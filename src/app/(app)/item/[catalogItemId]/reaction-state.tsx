"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createBacklogAction } from "@/app/actions/backlog-actions";
import {
  addItemAction,
  clearVerdictAction,
  setObsessedAction,
  setVerdictAction,
} from "@/app/actions/backlog-item-actions";
import { setMembershipAction } from "@/app/actions/complete-actions";
import { extractPalette } from "@/modules/cards/palette";
import type { OwnReview } from "@/modules/reviews/types";

/**
 * The item detail's shared client state (Revamp UI 06/08, 2026-09-03).
 *
 * Reaction is TWO INDEPENDENT axes (F3.7): a `verdict` (me gustó / no me
 * gustó) and an `obsessed` flag; completion is a third. Each axis runs through
 * `useOptimisticAxis` — its own state, ref and compare-before-revert guard —
 * so a failed write from one surface never clobbers a newer optimistic write.
 *
 * Since the revamp the same provider also owns what used to be scattered
 * across the page:
 *  - LIBRARY membership. A title that isn't in the library yet still shows
 *    the reaction row; the first tap adds it (`ensureInLibrary`) and then
 *    applies the reaction. Membership per backlog (`memberIds`) drives the
 *    "En N backlogs" button and its sheet without a server round-trip.
 *  - The viewer's OWN review, because the Completar sheet (opened from the
 *    reaction row) writes it and the reviews block (further down) shows it.
 *  - Which overlay is open: the Completar sheet, or the backlogs sheet in
 *    "manage" mode (toggle memberships) or "pick" mode (choose where the
 *    title goes before a reaction can be saved).
 *
 * Nothing here calls router.refresh() on add: the provider is keyed on the
 * entry id in page.tsx, and a refresh that swaps `none → id` would remount
 * this tree mid-flow and drop an open sheet. The state IS the truth for the
 * visit; the actions revalidate the other screens.
 */

export type ItemVerdictValue = "disliked" | "liked" | null;

export interface BacklogOption {
  id: string;
  name: string;
}

type ActionResult = { ok: true } | { error: string };

/**
 * One optimistic axis: sets `value` immediately, persists, and rolls back on
 * failure — but ONLY if our optimistic write is still current
 * (compare-before-revert), so a slow failure never clobbers a newer write from
 * a fast re-tap. `persist` must be a stable (module-level) reference.
 */
function useOptimisticAxis<T>(
  catalogItemId: string,
  enabledRef: React.RefObject<boolean>,
  initial: T,
  persist: (id: string, next: T) => Promise<ActionResult>,
): [T, (next: T) => Promise<boolean>, (next: T) => void] {
  const [value, setValue] = useState<T>(initial);
  // Mirror kept in sync HERE (mutate is the only writer), so a snapshot never
  // needs a render-time ref read.
  const ref = useRef<T>(initial);

  const mutate = useCallback(
    async (next: T): Promise<boolean> => {
      if (!enabledRef.current) return false;
      const prev = ref.current;
      ref.current = next;
      setValue(next); // optimistic — revert on failure
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

  // A write that already landed elsewhere (the Completar sheet's one action)
  // — set without persisting.
  const settle = useCallback((next: T) => {
    ref.current = next;
    setValue(next);
  }, []);

  return [value, mutate, settle];
}

// Stable persisters (module-level) so the hook's callback deps don't churn.
const persistVerdict = (
  id: string,
  next: ItemVerdictValue,
): Promise<ActionResult> =>
  next === null ? clearVerdictAction(id) : setVerdictAction(id, next);
const persistObsessed = (id: string, next: boolean): Promise<ActionResult> =>
  setObsessedAction(id, next);
const persistNothing = async (): Promise<ActionResult> => ({ ok: true });

export type BacklogsSheetMode = "manage" | "pick" | null;

interface ItemReactionState {
  catalogItemId: string;
  inLibrary: boolean;
  /** Backlogs the title is filed under. */
  memberIds: readonly string[];
  /** The user's backlogs — grows when the sheet creates one. */
  backlogs: readonly BacklogOption[];
  verdict: ItemVerdictValue;
  obsessed: boolean;
  completed: boolean;
  /**
   * Optimistically sets the verdict and persists it. Resolves `true` when
   * saved; `false` on failure — after reverting the optimistic value, but ONLY
   * if no newer write landed in between (callers show their own error copy).
   */
  mutateVerdict: (next: ItemVerdictValue) => Promise<boolean>;
  /** Same optimistic contract as mutateVerdict, for the obsession flag. */
  mutateObsessed: (next: boolean) => Promise<boolean>;
  /** Mirror a write the Completar sheet already made in one server call. */
  settleFromComplete: (next: {
    verdict: ItemVerdictValue;
    obsessed: boolean;
  }) => void;
  /**
   * Make sure the title is in the library before a reaction is saved: already
   * there → true; one backlog → adds straight to it; several → opens the
   * picker and resolves when the user chose (false if they dismissed it).
   */
  ensureInLibrary: () => Promise<boolean>;
  /** The "En N backlogs" sheet. */
  backlogsSheet: BacklogsSheetMode;
  openBacklogs: () => void;
  closeBacklogs: () => void;
  /** Sheet rows: pick mode adds and resolves; manage mode toggles. */
  chooseBacklog: (backlogId: string) => Promise<void>;
  createBacklogAndAdd: (name: string) => Promise<boolean>;
  busy: boolean;
  ownReview: OwnReview | null;
  setOwnReview: (next: OwnReview | null) => void;
  completeOpen: boolean;
  openComplete: () => void;
  closeComplete: () => void;
  recoHidden: boolean;
  setRecoHidden: (hidden: boolean) => void;
}

const Ctx = createContext<ItemReactionState | null>(null);

export function ItemReactionProvider({
  catalogItemId,
  posterUrl,
  paletteHex,
  backlogs: initialBacklogs,
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
  /** Empty ⇒ not in the library. */
  initialMemberIds: string[];
  initialVerdict: ItemVerdictValue;
  initialObsessed: boolean;
  initialCompleted: boolean;
  initialOwnReview: OwnReview | null;
  children: ReactNode;
}) {
  const [memberIds, setMemberIds] = useState<string[]>(initialMemberIds);
  const [backlogs, setBacklogs] = useState<BacklogOption[]>(initialBacklogs);
  const inLibrary = memberIds.length > 0;
  // Read by the axes at mutate time. Kept in step by the two writers of
  // memberIds (addTo, chooseBacklog) — set synchronously by addTo BEFORE the
  // reaction that follows the add is applied, never during render.
  const inLibraryRef = useRef(inLibrary);

  const [verdict, mutateVerdict, settleVerdict] =
    useOptimisticAxis<ItemVerdictValue>(
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
  const [recoHidden, setRecoHidden] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [backlogsSheet, setBacklogsSheet] = useState<BacklogsSheetMode>(null);
  const [busy, setBusy] = useState(false);
  const pendingPick = useRef<((ok: boolean) => void) | null>(null);

  // Palette is cover-derived + cached on catalog_item; extract on-device only
  // when this title has none yet ([] on CORS failure).
  const needsPalette = !paletteHex || paletteHex.length === 0;
  const paletteFor = useCallback(async () => {
    if (!needsPalette || !posterUrl) return undefined;
    const hex = await extractPalette(posterUrl);
    return hex.length > 0 ? hex : undefined;
  }, [needsPalette, posterUrl]);

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
        inLibraryRef.current = true;
        setMemberIds((ids) => (ids.includes(backlogId) ? ids : [...ids, backlogId]));
        return true;
      } catch {
        return false;
      } finally {
        setBusy(false);
      }
    },
    [catalogItemId, paletteFor],
  );

  const resolvePick = useCallback((ok: boolean) => {
    pendingPick.current?.(ok);
    pendingPick.current = null;
  }, []);

  const ensureInLibrary = useCallback(async (): Promise<boolean> => {
    if (inLibraryRef.current) return true;
    if (backlogs.length === 1) return addTo(backlogs[0].id);
    return new Promise<boolean>((resolve) => {
      resolvePick(false); // a stale waiter, if any, is told no
      pendingPick.current = resolve;
      setBacklogsSheet("pick");
    });
  }, [addTo, backlogs, resolvePick]);

  const closeBacklogs = useCallback(() => {
    setBacklogsSheet(null);
    resolvePick(false);
  }, [resolvePick]);

  const chooseBacklog = useCallback(
    async (backlogId: string) => {
      if (backlogsSheet === "pick") {
        const ok = await addTo(backlogId);
        setBacklogsSheet(null);
        resolvePick(ok);
        return;
      }
      // manage: toggle, optimistically
      const wasMember = memberIds.includes(backlogId);
      const before = memberIds;
      const after = wasMember
        ? memberIds.filter((id) => id !== backlogId)
        : [...memberIds, backlogId];
      setMemberIds(after);
      inLibraryRef.current = after.length > 0;
      setBusy(true);
      try {
        const res = await setMembershipAction({
          backlogId,
          catalogItemId,
          member: !wasMember,
          paletteHex: wasMember ? undefined : await paletteFor(),
        });
        if ("error" in res) throw new Error(res.error);
        // Leaving the last backlog GC's the per-title state on the server
        // (removeMembershipAction) — mirror it so the row goes dark.
        if (after.length === 0) {
          settleVerdict(null);
          settleObsessed(false);
          settleCompleted(false);
          setOwnReview(null);
        }
      } catch {
        setMemberIds(before);
        inLibraryRef.current = before.length > 0;
      } finally {
        setBusy(false);
      }
    },
    [
      addTo,
      backlogsSheet,
      catalogItemId,
      memberIds,
      paletteFor,
      resolvePick,
      settleCompleted,
      settleObsessed,
      settleVerdict,
    ],
  );

  const createBacklogAndAdd = useCallback(
    async (name: string): Promise<boolean> => {
      setBusy(true);
      try {
        const res = await createBacklogAction({ name });
        const id = "id" in res ? res.id : null;
        if (!id) return false;
        setBacklogs((list) => [{ id, name }, ...list]);
        const ok = await addTo(id);
        if (backlogsSheet === "pick") {
          setBacklogsSheet(null);
          resolvePick(ok);
        }
        return ok;
      } catch {
        return false;
      } finally {
        setBusy(false);
      }
    },
    [addTo, backlogsSheet, resolvePick],
  );

  const settleFromComplete = useCallback(
    (next: { verdict: ItemVerdictValue; obsessed: boolean }) => {
      settleVerdict(next.verdict);
      settleObsessed(next.obsessed);
      settleCompleted(true);
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
        verdict,
        obsessed,
        completed,
        mutateVerdict,
        mutateObsessed,
        settleFromComplete,
        ensureInLibrary,
        backlogsSheet,
        openBacklogs: () => setBacklogsSheet("manage"),
        closeBacklogs,
        chooseBacklog,
        createBacklogAndAdd,
        busy,
        ownReview,
        setOwnReview,
        completeOpen,
        openComplete: () => setCompleteOpen(true),
        closeComplete: () => setCompleteOpen(false),
        recoHidden,
        setRecoHidden,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useItemReaction(): ItemReactionState {
  const ctx = useContext(Ctx);
  if (!ctx)
    throw new Error("useItemReaction must be used inside ItemReactionProvider");
  return ctx;
}

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  clearVerdictAction,
  setObsessedAction,
  setVerdictAction,
} from "@/app/actions/backlog-item-actions";

/**
 * Shared optimistic UI state for the item detail. Reaction is now TWO
 * INDEPENDENT axes (F3.7 followup): a `verdict` (me gusta / no me gusta, edited
 * from the ⋯ menu) and an `obsessed` flag (the prominent gesture). They no
 * longer share a field, so marking a verdict never un-lights the obsession and
 * vice versa. Each axis runs through `useOptimisticAxis` — its own state, ref
 * and compare-before-revert guard — so a failed write from one surface never
 * clobbers a newer optimistic write.
 *
 * `recoHidden` mirrors "Ocultar recomendación" optimistically: it hides the
 * ✦ eyebrow, the "¿Por qué?" panel and the feedback chips before the server
 * roundtrip lands (the action nulls sourceCrossMediaRecId for real).
 */

export type ItemVerdictValue = "disliked" | "liked" | null;

type ActionResult = { ok: true } | { error: string };

/**
 * One optimistic axis: sets `value` immediately, persists, and rolls back on
 * failure — but ONLY if our optimistic write is still current
 * (compare-before-revert), so a slow failure never clobbers a newer write from
 * a fast re-tap. `persist` must be a stable (module-level) reference.
 */
function useOptimisticAxis<T>(
  catalogItemId: string | null,
  initial: T,
  persist: (id: string, next: T) => Promise<ActionResult>,
): [T, (next: T) => Promise<boolean>] {
  const [value, setValue] = useState<T>(initial);
  // Mirror kept in sync HERE (mutate is the only writer), so a snapshot never
  // needs a render-time ref read.
  const ref = useRef<T>(initial);

  const mutate = useCallback(
    async (next: T): Promise<boolean> => {
      if (!catalogItemId) return false;
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
    [catalogItemId, persist],
  );

  return [value, mutate];
}

// Stable persisters (module-level) so the hook's callback deps don't churn.
const persistVerdict = (
  id: string,
  next: ItemVerdictValue,
): Promise<ActionResult> =>
  next === null ? clearVerdictAction(id) : setVerdictAction(id, next);
const persistObsessed = (id: string, next: boolean): Promise<ActionResult> =>
  setObsessedAction(id, next);

interface ItemReactionState {
  verdict: string | null;
  obsessed: boolean;
  /**
   * Optimistically sets the verdict and persists it. Resolves `true` when
   * saved; `false` on failure — after reverting the optimistic value, but ONLY
   * if no newer write landed in between (callers show their own error copy).
   */
  mutateVerdict: (next: ItemVerdictValue) => Promise<boolean>;
  /** Same optimistic contract as mutateVerdict, for the obsession flag. */
  mutateObsessed: (next: boolean) => Promise<boolean>;
  recoHidden: boolean;
  setRecoHidden: (hidden: boolean) => void;
}

const Ctx = createContext<ItemReactionState | null>(null);

export function ItemReactionProvider({
  catalogItemId,
  initialVerdict,
  initialObsessed,
  children,
}: {
  /** Null while the item isn't logged — the mutations are no-ops then. */
  catalogItemId: string | null;
  initialVerdict: ItemVerdictValue;
  initialObsessed: boolean;
  children: ReactNode;
}) {
  const [verdict, mutateVerdict] = useOptimisticAxis<ItemVerdictValue>(
    catalogItemId,
    initialVerdict,
    persistVerdict,
  );
  const [obsessed, mutateObsessed] = useOptimisticAxis<boolean>(
    catalogItemId,
    initialObsessed,
    persistObsessed,
  );
  const [recoHidden, setRecoHidden] = useState(false);

  return (
    <Ctx.Provider
      value={{
        verdict,
        obsessed,
        mutateVerdict,
        mutateObsessed,
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

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
  clearReactionAction,
  setReactionAction,
} from "@/app/actions/backlog-item-actions";

/**
 * Shared optimistic UI state for the item detail. The reaction is a single
 * field edited from TWO places (the prominent "Me obsesiona" gesture and the
 * ⋯ menu's me gusta / no me gusta verdicts), so both read/write this context —
 * picking a verdict while obsessed visibly un-lights the obsession gesture.
 * The mutation itself is centralized in `mutateReaction` so a failed write
 * from one surface never clobbers a newer optimistic write from the other.
 *
 * `recoHidden` mirrors "Ocultar recomendación" optimistically: it hides the
 * ✦ eyebrow, the "¿Por qué?" panel and the feedback chips before the server
 * roundtrip lands (the action nulls sourceCrossMediaRecId for real).
 */

export type ItemReactionValue = "disliked" | "liked" | "obsessed" | null;

interface ItemReactionState {
  reaction: string | null;
  /**
   * Optimistically sets the reaction and persists it. Resolves `true` when
   * saved; `false` on failure — after reverting the optimistic value, but ONLY
   * if no newer write landed in between (callers show their own error copy).
   */
  mutateReaction: (next: ItemReactionValue) => Promise<boolean>;
  recoHidden: boolean;
  setRecoHidden: (hidden: boolean) => void;
}

const Ctx = createContext<ItemReactionState | null>(null);

export function ItemReactionProvider({
  backlogItemId,
  initialReaction,
  children,
}: {
  /** Null while the item isn't logged — mutateReaction is a no-op then. */
  backlogItemId: string | null;
  initialReaction: string | null;
  children: ReactNode;
}) {
  const [reaction, setReaction] = useState<string | null>(initialReaction);
  const [recoHidden, setRecoHidden] = useState(false);
  // Mirror of `reaction` kept in sync HERE (mutateReaction is the only writer),
  // so a snapshot never needs a render-time ref read.
  const reactionRef = useRef<string | null>(initialReaction);

  const mutateReaction = useCallback(
    async (next: ItemReactionValue): Promise<boolean> => {
      if (!backlogItemId) return false;
      const prev = reactionRef.current;
      reactionRef.current = next;
      setReaction(next); // optimistic — revert on failure
      // Compare-before-revert: only roll back if OUR optimistic value is still
      // current — never clobber a newer write from the other surface.
      const revert = () => {
        if (reactionRef.current === next) reactionRef.current = prev;
        setReaction((current) => (current === next ? prev : current));
      };
      try {
        const res =
          next === null
            ? await clearReactionAction(backlogItemId)
            : await setReactionAction(backlogItemId, next);
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
    [backlogItemId],
  );

  return (
    <Ctx.Provider
      value={{ reaction, mutateReaction, recoHidden, setRecoHidden }}
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

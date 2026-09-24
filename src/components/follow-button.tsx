"use client";

import { useEffect, useId, useTransition, useState } from "react";
import {
  FOLLOW_HONEY_BASE,
  FOLLOW_HONEY_OFF,
  FOLLOW_HONEY_ON,
  FOLLOW_ROW_BASE,
  FOLLOW_ROW_OFF,
  FOLLOW_ROW_ON,
} from "./follow-pill";
import { Toast, useToast } from "@/components/kura/toast";
import {
  followUserAction,
  unfollowUserAction,
} from "@/app/actions/social-actions";

/**
 * F3.10 — the one follow control, everywhere a person can be followed (the
 * public profile, the feed's suggestion card, the people rows). Optimistic:
 * the pill flips on tap and only reverts if the server says no.
 *
 * Kura (2026-09-24):
 *  - `kura` — honey "Seguir" (the one honey action of the screen), glass
 *    "Siguiendo". Used by /u/* and the feed's suggestion card. No glow — the
 *    feed's lima-glow exception died with the Revamp.
 *  - `row` — the people rows: glass 36 "Seguir", transparent "Siguiendo".
 *
 * O10b "Dejar de seguir": tapping "Siguiendo" unfollows AT ONCE, no
 * confirmation (§patrones · confirmar y deshacer: only the irreversible is
 * confirmed) — and says so in the shared Kura toast: "Dejaste de seguir a
 * @x · Deshacer", over the dock, 5 s. A failure says what happened and
 * offers "Reintentar" behind the triangle, never a silent revert.
 */

type Variant = "kura" | "row";

/** One pill at a time across the page: every FollowButton owns a toast, so a
 *  new one tells the others to leave. */
const TOAST_EVENT = "kura:follow-toast";

export function FollowButton({
  username,
  initialFollowing,
  variant = "kura",
  toastBottom = 112,
  className = "",
}: {
  username: string;
  initialFollowing: boolean;
  variant?: Variant;
  /** Where the toast sits: clear of the dock by default (40 on dock-less pages). */
  toastBottom?: number;
  className?: string;
}) {
  const [following, setFollowing] = useState(initialFollowing);
  const [, startTransition] = useTransition();
  const { toast, show, act, dismiss } = useToast();
  const id = useId();

  useEffect(() => {
    const onOther = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== id) dismiss();
    };
    window.addEventListener(TOAST_EVENT, onOther);
    return () => window.removeEventListener(TOAST_EVENT, onOther);
  }, [id, dismiss]);

  function announce(spec: Parameters<typeof show>[0]) {
    window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: id }));
    show(spec);
  }

  function run(next: boolean) {
    setFollowing(next);
    startTransition(async () => {
      // The try/catch is load-bearing: an action can REJECT (expired session,
      // network drop, stale build), not just return {error} — and /u/* has no
      // error boundary, so an unhandled rejection would take the whole page.
      let ok = false;
      try {
        const result = next
          ? await followUserAction(username)
          : await unfollowUserAction(username);
        ok = !("error" in result);
      } catch {
        ok = false;
      }
      if (!ok) {
        setFollowing(!next);
        announce({
          kind: "error",
          message: next
            ? `No se pudo seguir a @${username}.`
            : `No se pudo dejar de seguir a @${username}.`,
          actionLabel: "Reintentar",
          onAction: () => run(next),
        });
        return;
      }
      if (!next) {
        announce({
          kind: "undo",
          message: `Dejaste de seguir a @${username}`,
          actionLabel: "Deshacer",
          onAction: () => run(true),
        });
      }
    });
  }

  const cls =
    variant === "row"
      ? `${FOLLOW_ROW_BASE} ${following ? FOLLOW_ROW_OFF : FOLLOW_ROW_ON}`
      : `${FOLLOW_HONEY_BASE} ${following ? FOLLOW_HONEY_OFF : FOLLOW_HONEY_ON}`;

  return (
    <>
      <button
        type="button"
        onClick={() => run(!following)}
        aria-pressed={following}
        aria-label={following ? `Siguiendo a @${username} · dejar de seguir` : `Seguir a @${username}`}
        className={`${cls} ${className}`}
      >
        {following ? "Siguiendo" : "Seguir"}
      </button>
      <Toast toast={toast} onAction={act} bottom={toastBottom} />
    </>
  );
}

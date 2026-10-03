"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { ONBOARDING_EXIT_LABEL, ONBOARDING_TO_PARTY } from "@/components/kura/attempt";
import type { ToastHost } from "@/components/kura/toast";
import { safeReturnTo } from "@/lib/return-to";
import { setPartyFlash } from "./party-flash";

/**
 * What the party screens do with a server action's failure (silent-failure
 * sweep, M3/M4) — ONE place, so no sheet swallows an error into "inténtalo
 * otra vez" again:
 *
 *   - `signin_required` → the session is gone: hard navigation to the
 *     action's `loginPath` (`/login?to=/c/{id}` brings them back);
 *   - `onboarding_required` → the sentence above plus its way out (the
 *     toast's action goes to `/onboarding?to=` this screen);
 *   - `not_found` → the party is gone for this person (deleted, they were
 *     taken out, a user block): back to /backlogs with a toast there;
 *   - every other code → its sentence below, or the server's own `message`
 *     when it sent one (duplicates, `too_many_parties`);
 *   - a THROWN action (network, 500) → `console.error` with the operation
 *     and the party id, then the operation's fallback sentence.
 */

export const PARTY_GONE_MESSAGE = "Esa fiesta ya no está disponible";

/** F2.2: an account without its birth year can't create a party, edit it or
 *  rotate its link. Retrying refuses forever — the way out is /onboarding. */
export const PARTY_ONBOARDING_MESSAGE = ONBOARDING_TO_PARTY;

/**
 * Where "Terminar" goes: the sign-up's last step, and back to this screen —
 * when this screen is a destination `/onboarding` accepts (`safeReturnTo`: a
 * party or an invitation). From anywhere else (`/backlogs`, the profile) a
 * `?to=` would be dropped on arrival, so it isn't sent.
 */
export function partyOnboardingPath(): string {
  const to = safeReturnTo(window.location.pathname);
  return to ? `/onboarding?to=${encodeURIComponent(to)}` : "/onboarding";
}

const COPY: Record<string, string> = {
  forbidden: "No tienes permiso para hacer eso.",
  unavailable: "Las fiestas llegan muy pronto.",
  song_not_found: "Esa canción ya no está en el catálogo. Búscala de nuevo.",
  conflict: "Algo cambió mientras tanto. Recarga la fiesta y vuelve a intentarlo.",
  rate_limited: "Demasiados intentos seguidos. Espera un momento y vuelve a intentarlo.",
  too_many_parties: "Ya tienes 20 fiestas. Borra alguna para crear otra.",
  invalid: "Revisa lo que escribiste y vuelve a intentarlo.",
  not_blockable: "A esa persona no se le puede bloquear aquí. Solo puedes quitar la canción.",
  blocked: "Ya no puedes agregar canciones a esta fiesta.",
  view_only: "En esta fiesta solo se puede ver la colección.",
  onboarding_required: PARTY_ONBOARDING_MESSAGE,
};

/** The sentence for an action error code (or null: use the caller's fallback). */
export function partyErrorMessage(code: string): string | null {
  return COPY[code] ?? null;
}

/** `promise`, with a thrown action logged (operation + party) and turned
 *  into null — the caller then shows its fallback. Never silent. */
export function logged<T>(op: string, partyId: string | null, promise: Promise<T>): Promise<T | null> {
  return promise.catch((err: unknown) => {
    console.error(`[party] ${op} failed`, { partyId }, err);
    return null;
  });
}

type Failure = { error: string; loginPath?: string; message?: string; retryAfterSeconds?: number };

function isFailure(res: unknown): res is Failure {
  return typeof res === "object" && res !== null && "error" in res && typeof (res as Failure).error === "string";
}

/**
 * `fail(res, fallback, onNotFound?)` — handles any non-ok action result (or
 * null from `logged`). Returns the code it handled, so a caller can do
 * something extra. `onNotFound` replaces the redirect where `not_found` may
 * mean "that ROW is gone" rather than "the party is" (an unknown `guestRef`,
 * a song someone else already removed): pass the room's refresh — it
 * redirects by itself if the party really is gone.
 */
export function usePartyFailure(toast: ToastHost) {
  const router = useRouter();
  return useCallback(
    (res: unknown, fallback: string, onNotFound?: () => void): string | null => {
      if (!isFailure(res)) {
        toast.show({ message: fallback, kind: "error" });
        return null;
      }
      switch (res.error) {
        case "signin_required":
          window.location.assign(res.loginPath ?? "/login");
          return res.error;
        case "onboarding_required":
          toast.show({
            message: PARTY_ONBOARDING_MESSAGE,
            kind: "error",
            actionLabel: ONBOARDING_EXIT_LABEL,
            onAction: () => router.push(partyOnboardingPath()),
          });
          return res.error;
        case "not_found":
          if (onNotFound) {
            onNotFound();
            return res.error;
          }
          setPartyFlash(PARTY_GONE_MESSAGE);
          router.replace("/backlogs");
          return res.error;
        default:
          toast.show({ message: res.message ?? partyErrorMessage(res.error) ?? fallback, kind: "error" });
          return res.error;
      }
    },
    [router, toast],
  );
}

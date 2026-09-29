"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import type { ToastHost } from "@/components/kura/toast";
import { setPartyFlash } from "./party-flash";

/**
 * What the party screens do with a server action's failure (silent-failure
 * sweep, M3/M4) — ONE place, so no sheet swallows an error into "inténtalo
 * otra vez" again:
 *
 *   - `signin_required` → the session is gone: hard navigation to the
 *     action's `loginPath` (`/login?to=/c/{id}` brings them back);
 *   - `not_found` → the party is gone for this person (deleted, they were
 *     taken out, a user block): back to /backlogs with a toast there;
 *   - every other code → its sentence below, or the server's own `message`
 *     when it sent one (duplicates, `too_many_parties`);
 *   - a THROWN action (network, 500) → `console.error` with the operation
 *     and the party id, then the operation's fallback sentence.
 */

export const PARTY_GONE_MESSAGE = "Esa fiesta ya no está disponible.";

const COPY: Record<string, string> = {
  forbidden: "No puedes hacer eso en esta fiesta.",
  unavailable: "Las fiestas todavía no están disponibles. Inténtalo más tarde.",
  song_not_found: "Esa canción ya no está en el catálogo. Búscala de nuevo.",
  conflict: "Algo cambió mientras tanto. Vuelve a cargar la fiesta e inténtalo otra vez.",
  rate_limited: "Vas muy rápido. Espera un momento e inténtalo otra vez.",
  too_many_parties: "Ya tienes 20 fiestas. Borra alguna para crear otra.",
  invalid: "Revisa lo que escribiste e inténtalo otra vez.",
  not_blockable: "A esa persona no se le puede bloquear aquí. Solo puedes quitar la canción.",
  blocked: "Ya no puedes agregar canciones.",
  view_only: "En esta fiesta solo se ve la colección.",
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

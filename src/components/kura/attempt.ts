/**
 * The one way a client write talks to a server action.
 *
 * A server action can fail in TWO ways: it returns `{ error }` (a refusal the
 * action chose), or its promise REJECTS (network drop, expired session, a
 * stale build whose action id no longer exists). Inside a `startTransition`
 * an unhandled rejection goes to the nearest error boundary and takes the
 * screen with it; outside one it is an unhandled promise and the optimistic
 * UI simply stays wrong. `attempt` folds both into one outcome, so the caller
 * has a single branch to revert state and say what happened (toast or inline
 * note) — never a silent revert, never a lost draft.
 *
 * ONE thing is not a failure: an action that ends in `redirect()` REJECTS
 * its promise with Next's redirect signal while the router is already
 * navigating (server-action-reducer). `attempt` re-throws that signal
 * (`unstable_rethrow`, the mechanism Next 16.3 documents) instead of
 * reporting "unreached" — otherwise a successful "borrar colección" would
 * paint its error note on the way out. Callers need no detection of their
 * own: after `await attempt(...)`, code only runs if there was no redirect.
 *
 * Plain module (no "use client"): safe to import from anywhere
 * (learnings/2026-09-03-export-de-modulo-use-client…).
 */

import { unstable_rethrow } from "next/navigation";

export type Attempt<T> =
  | { ok: true; value: Exclude<T, { error: string }> }
  | { ok: false; error: string };

/** What `error` reads when the action never answered. */
export const ATTEMPT_UNREACHED = "unreached";

export async function attempt<T>(run: () => Promise<T>): Promise<Attempt<T>> {
  try {
    const value = await run();
    if (
      value !== null &&
      typeof value === "object" &&
      "error" in value &&
      typeof (value as { error: unknown }).error === "string"
    ) {
      return { ok: false, error: (value as { error: string }).error };
    }
    return { ok: true, value: value as Exclude<T, { error: string }> };
  } catch (err) {
    // Next's own signals (redirect / notFound) go through untouched.
    unstable_rethrow(err);
    return { ok: false, error: ATTEMPT_UNREACHED };
  }
}

/** The copy for a write that didn't land (§patrones · error: literal, sin guiño). */
export const WRITE_FAILED = "No se pudo guardar. Revisa tu conexión y vuelve a intentarlo.";

/** What a failed write adds when a draft is still in the field. */
export const DRAFT_KEPT = "Tu texto sigue aquí.";

/**
 * `onboarding_required` (F2.2: an account without its birth year). ONE
 * formula on every screen — "Termina tu registro para …" — and retrying
 * refuses forever, so each caller pairs it with the way out
 * (`ONBOARDING_EXIT_LABEL` → `/onboarding`).
 */
const finishSignupTo = (what: string) => `Termina tu registro para ${what}.`;
export const ONBOARDING_TO_FOLLOW = finishSignupTo("seguir a gente");
export const ONBOARDING_TO_PARTY = finishSignupTo("organizar fiestas");
export const ONBOARDING_TO_REVIEW = finishSignupTo("publicar reseñas");
export const ONBOARDING_TO_EDIT_PROFILE = finishSignupTo("editar tu perfil");
export const ONBOARDING_EXIT_LABEL = "Terminar";

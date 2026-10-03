"use client";

import { Fragment } from "react";
import { useOptimisticChoice } from "@/hooks/use-optimistic-choice";
import { setPreferredServiceAction } from "@/app/actions/account-actions";
import { SERVICES, type ServiceId } from "../services";

/**
 * The radio list of 30b: tapping a row saves at once (no Guardar); the
 * chosen one carries the check. A failure puts the previous choice back and
 * says so under the list — but only if that tap still owns the screen: a
 * slow failure of an EARLIER tap must not undo a later choice (it used to
 * put back a value two taps old). The fallback is the last choice the server
 * confirmed, never "whatever was on screen when this tap started".
 */
export function MusicPicker({ initial }: { initial: ServiceId | null }) {
  const [service, save, error] = useOptimisticChoice<ServiceId | null>(initial, (id) =>
    id ? setPreferredServiceAction(id) : Promise.resolve(),
  );
  const pick = (id: ServiceId) => void save(id);

  return (
    <div className="flex flex-col gap-2">
      <div role="radiogroup" aria-label="Abrir música en" className="flex flex-col overflow-hidden rounded-[var(--r-surface)] bg-surface-1">
        {SERVICES.map((s, i) => {
          const on = service === s.id;
          return (
            <Fragment key={s.id}>
            {i > 0 && <span aria-hidden className="ml-4 h-px bg-white/[0.06]" />}
            <button
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => pick(s.id)}
              className="flex min-h-[52px] items-center gap-3 px-4 text-left transition-colors active:bg-white/[0.06]"
            >
              <span className="flex-1 text-[16px] text-text">{s.label}</span>
              {on && (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="text-text" aria-hidden>
                  <path d="M4.5 12.5l4.8 4.8L19.5 7" />
                </svg>
              )}
            </button>
            </Fragment>
          );
        })}
      </div>
      <p className="px-2 text-[13px] leading-[1.5] text-pretty text-text-2">
        {error ?? "El botón “Abrir en” de cada álbum usa esta app. Si no la tienes, se abre la web."}
      </p>
    </div>
  );
}

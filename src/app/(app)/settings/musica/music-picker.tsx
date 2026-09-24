"use client";

import { Fragment, useState } from "react";
import { setPreferredServiceAction } from "@/app/actions/account-actions";
import { SERVICES, type ServiceId } from "../services";

/**
 * The radio list of 30b: tapping a row saves at once (no Guardar); the
 * chosen one carries the check. A failure puts the previous choice back and
 * says so under the list.
 */
export function MusicPicker({ initial }: { initial: ServiceId | null }) {
  const [service, setService] = useState<ServiceId | null>(initial);
  const [error, setError] = useState<string | null>(null);

  async function pick(id: ServiceId) {
    const prev = service;
    setService(id);
    setError(null);
    try {
      const res = await setPreferredServiceAction(id);
      if ("error" in res) throw new Error(res.error);
    } catch {
      setService(prev);
      setError("No se pudo guardar. Revisa tu conexión y vuelve a intentar.");
    }
  }

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
        {error ?? "“Abrir en”, en cada álbum, usa esta app. Si no la tienes instalada, abre la web."}
      </p>
    </div>
  );
}

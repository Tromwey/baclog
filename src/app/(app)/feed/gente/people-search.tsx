"use client";

import { useEffect, useRef, useState } from "react";
import { searchProfilesAction } from "@/app/actions/social-actions";
import { PersonRowView } from "@/app/(app)/perfil/people-list";
import { SuggestionRow } from "@/app/(app)/feed/suggestions";
import {
  PROFILE_SEARCH_LIMIT,
  PROFILE_SEARCH_MIN_CHARS,
  type PersonRow,
  type SuggestedProfile,
} from "@/modules/social/types";

const DEBOUNCE_MS = 250;

/** `rows: null` = the request failed. */
type Answer = { needle: string; rows: PersonRow[] | null };

/**
 * The live half of Buscar gente. One input; what sits under it is decided by
 * the needle: nothing typed → "Para seguir" (the server-rendered suggestions),
 * a needle → the results of the last settled keystroke. Requests are
 * sequenced by a counter so a slow early response can never overwrite a
 * later one (the same stale-response trap Descubrir's search hit).
 *
 * No exact-handle "Ir": a full handle that exists and is public is simply the
 * first result (rank 0), one tap away — and a private one is not findable
 * here any more than by URL, which is the whole point.
 */
export function PeopleSearch({
  suggestions,
}: {
  suggestions: SuggestedProfile[];
}) {
  const [query, setQuery] = useState("");
  // The last settled answer, TAGGED with the needle it answers. Everything
  // else is derived: "loading" is simply "the answer isn't for this needle
  // yet" — no state written inside the effect, and a slow early response
  // can't overwrite a later one because the sequence check drops it.
  const [answer, setAnswer] = useState<Answer | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  const needle = query.trim().replace(/^@/, "");
  const searching = needle.length >= PROFILE_SEARCH_MIN_CHARS;

  useEffect(() => {
    if (!searching) return;
    const id = ++seq.current;
    const timer = setTimeout(async () => {
      try {
        const rows = await searchProfilesAction({ q: needle });
        if (id === seq.current) setAnswer({ needle, rows });
      } catch {
        if (id === seq.current) setAnswer({ needle, rows: null });
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [needle, searching]);

  const settled = answer !== null && answer.needle === needle;
  // While a new needle is in flight, the previous rows stay on screen dimmed
  // (a blank flash per keystroke reads as "nothing found").
  const rows = settled ? answer.rows : (answer?.rows ?? null);
  const loading = searching && !settled;
  const errored = settled && answer.rows === null;

  return (
    <div>
      <form
        role="search"
        onSubmit={(e) => e.preventDefault()}
        className="flex h-12 items-center gap-2.5 rounded-full bg-[var(--glass-bg)] px-4 transition-colors focus-within:bg-white/[0.11]"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="flex-none text-text-2" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por @usuario o nombre"
          aria-label="Buscar gente por @usuario o nombre"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          className="min-w-0 flex-1 bg-transparent font-sans text-[16px] text-text outline-none placeholder:text-text-2"
        />
        {query && (
          <button
            type="button"
            aria-label="Borrar"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            className="-mr-2 flex h-11 w-11 flex-none items-center justify-center rounded-full text-text-2 bl-press-sm hover:text-text"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        )}
      </form>

      {!searching ? (
        <Suggestions suggestions={suggestions} typing={needle.length > 0} />
      ) : loading && (!rows || rows.length === 0) ? (
        // Nothing worth keeping on screen from the previous needle — say
        // "searching", never a stale "nobody found" for a needle in flight.
        <Eyebrow>Buscando…</Eyebrow>
      ) : errored ? (
        <p className="mt-6 text-[15px] leading-[1.5] text-pretty text-text-2">
          No se pudo buscar. Revisa tu conexión y escribe de nuevo.
        </p>
      ) : !rows || rows.length === 0 ? (
        <div className="mt-8 flex flex-col gap-2">
          <p className="font-brand text-[28px] leading-[1.1] text-text">nadie con ese nombre.</p>
          <p className="text-[15px] leading-[1.5] text-pretty text-text-2">
            Los perfiles privados no aparecen aquí: pídele su link a quien
            quieras seguir.
          </p>
        </div>
      ) : (
        <>
          <Eyebrow>
            {rows.length >= PROFILE_SEARCH_LIMIT
              ? `Primeros ${PROFILE_SEARCH_LIMIT} · afina la búsqueda`
              : "Resultados"}
          </Eyebrow>
          <div
            className={`mt-1 flex flex-col transition-opacity ${
              loading ? "opacity-60" : ""
            }`}
          >
            {rows.map((p) => (
              <PersonRowView key={p.username} p={p} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Suggestions({
  suggestions,
  typing,
}: {
  suggestions: SuggestedProfile[];
  typing: boolean;
}) {
  if (suggestions.length === 0) {
    return (
      <p className="mt-6 text-[15px] leading-[1.5] text-pretty text-text-2">
        Ya sigues a toda la gente pública que hay por ahora. Busca a alguien
        por su @usuario o nombre cuando llegue.
      </p>
    );
  }
  return (
    <>
      <Eyebrow>
        {typing
          ? `Escribe ${PROFILE_SEARCH_MIN_CHARS} letras o más`
          : "Para seguir"}
      </Eyebrow>
      <div className="mt-1 flex flex-col">
        {suggestions.map((s) => (
          <SuggestionRow key={s.username} s={s} />
        ))}
      </div>
    </>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-6 font-mono text-[11px] uppercase tracking-[0.1em] text-text-3">
      {children}
    </div>
  );
}

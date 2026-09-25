"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from "react";
import { useRouter } from "next/navigation";
import type { CatalogSearchResult } from "@/modules/catalog/types";
import { Cover, GLASS_BUTTON, SectionTitle } from "@/components/kura/components";
import type { LibraryIndex } from "./library";
import {
  clearRecentQueries,
  pushRecentQuery,
  pushSeen,
  readRecentQueries,
  readSeen,
  removeRecentQuery,
  type SeenWork,
} from "./recents";
import type { SaveWork } from "./save-sheet";
import {
  CloseGlyph,
  Highlight,
  KindPills,
  PlusGlyph,
  RecentGlyph,
  RowCover,
  SKELETON_PULSE,
  SavedCount,
  SearchGlyph,
  TriangleGlyph,
  workMeta,
  type KindTab,
} from "./kura-bits";

type Phase = "idle" | "loading" | "done" | "error";

/** Below this the catalog isn't queried (the API's own floor is 1, TMDB's useful one 2). */
const MIN_QUERY = 2;

/**
 * Descubrir's search (flujos-v2 · 19d / 19e / E5 / 19f / 19g): the field moves
 * to the top with "Cancelar" beside it and the page becomes the search.
 *
 *  - empty → **búsquedas recientes** (with Borrar and a ✕ per row) and
 *    **vistos hace poco** — both per-device (`recents.ts`);
 *  - one letter → the recents that contain it, the match in bold (19e);
 *  - searching → the skeleton in the results' real shape, 1.6 s pulse (E5);
 *  - results → **obras** with the count; a saved title wears the bookmark and
 *    how many collections it's in, the rest a glass + that opens "guardar en"
 *    (19f);
 *  - nothing → the Newsreader sentence, and "Buscar en todo" when a format
 *    filter is what emptied it (19g).
 *
 * The catalog is the product's unified search (TMDB + iTunes). People and
 * users aren't searchable in the product, so the mock's person card and
 * "usuarios" section — and their filter pills — don't exist here.
 */
export function SearchView({
  inputRef,
  initialQuery,
  library,
  onCancel,
  onSave,
}: {
  /** Owned by the parent so the opening tap can focus it inside the gesture (iOS). */
  inputRef: RefObject<HTMLInputElement | null>;
  /** From ?q= — a search restored after closing an item (re-runs on mount). */
  initialQuery: string;
  library: LibraryIndex;
  onCancel: () => void;
  onSave: (work: SaveWork) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [tab, setTab] = useState<KindTab>("all");
  const [results, setResults] = useState<CatalogSearchResult[]>([]);
  const [phase, setPhase] = useState<Phase>(
    initialQuery.trim().length >= MIN_QUERY ? "loading" : "idle",
  );
  const [attempt, setAttempt] = useState(0);
  // Read once on mount: this view only ever renders after a tap (or a ?q=
  // restore, which lands on results, not on the recents).
  const [recents, setRecents] = useState<string[]>(() =>
    typeof window === "undefined" ? [] : readRecentQueries(),
  );
  const [seen] = useState<SeenWork[]>(() =>
    typeof window === "undefined" ? [] : readSeen(),
  );
  const abortRef = useRef<AbortController | null>(null);

  const q = query.trim();

  useEffect(() => {
    if (q.length < MIN_QUERY) return;
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const ctl = new AbortController();
      abortRef.current = ctl;
      try {
        const res = await fetch(
          `/api/catalog/search?q=${encodeURIComponent(q)}&tab=${tab}`,
          { signal: ctl.signal },
        );
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        setResults(data.results);
        setPhase("done");
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          setPhase("error");
        }
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [q, tab, attempt]);

  const setText = (v: string) => {
    setQuery(v);
    if (v.trim().length < MIN_QUERY) {
      setResults([]);
      setPhase("idle");
    } else {
      setPhase("loading");
    }
  };

  const pickTab = (k: KindTab) => {
    setTab(k);
    if (q.length >= MIN_QUERY) setPhase("loading");
  };

  const retry = () => {
    setPhase("loading");
    setAttempt((n) => n + 1);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (q.length >= MIN_QUERY) setRecents(pushRecentQuery(q));
    // "buscar" on the keyboard: put the keyboard away so the results show.
    inputRef.current?.blur();
  };

  // Stamp the live query on THIS history entry before pushing the item, so the
  // item's back (router.back) lands on these same results. Native replaceState
  // syncs the URL without re-running the page.
  const openResult = (r: CatalogSearchResult) => {
    if (q.length >= MIN_QUERY) {
      window.history.replaceState(null, "", `/descubrir?q=${encodeURIComponent(q)}`);
      pushRecentQuery(q);
    }
    pushSeen({
      catalogItemId: r.catalogItemId,
      title: r.title,
      mediaType: r.mediaType,
      posterUrl: r.posterUrl,
    });
    router.push(`/item/${r.catalogItemId}`);
  };

  const typedOne = q.length > 0 && q.length < MIN_QUERY;
  const shownRecents = typedOne
    ? recents.filter((r) => r.toLowerCase().includes(q.toLowerCase()))
    : recents;
  const emptyAll = phase === "done" && results.length === 0 && tab === "all";
  const showPills = q.length >= MIN_QUERY && !emptyAll;

  return (
    <div className="flex min-h-dvh flex-col pb-dock-clearance">
      <div className="sticky top-0 z-[5] bg-bg pt-[max(64px,calc(20px+env(safe-area-inset-top)))]">
        <form onSubmit={submit} role="search" className="flex items-center gap-3 px-5">
          <label className="flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-full bg-[var(--glass-bg)] px-4 text-text-2 transition-colors focus-within:bg-white/[0.12]">
            <SearchGlyph />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setText(e.target.value)}
              placeholder="Películas, series y álbumes"
              aria-label="Buscar películas, series y álbumes"
              enterKeyHint="search"
              autoComplete="off"
              // 16px: iOS Safari zooms into a focused input below 16.
              className="min-w-0 flex-1 bg-transparent text-[16px] text-text caret-accent outline-none placeholder:text-text-2 [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setText("");
                  inputRef.current?.focus();
                }}
                aria-label="Borrar búsqueda"
                className="-mr-2 flex h-11 w-9 flex-none items-center justify-center text-text-2"
              >
                <CloseGlyph />
              </button>
            )}
          </label>
          <button
            type="button"
            onClick={onCancel}
            className="flex h-11 flex-none items-center text-[16px] font-medium text-text transition-opacity active:opacity-60"
          >
            Cancelar
          </button>
        </form>
        {showPills && (
          <KindPills value={tab} onSelect={pickTab} className="px-5 pb-2 pt-3.5" />
        )}
      </div>

      {q.length < MIN_QUERY && (
        <div className="flex flex-col gap-[26px] pt-6">
          {shownRecents.length > 0 && (
            <section className="flex flex-col gap-3.5">
              {!typedOne && (
                <div className="px-5">
                  <SectionTitle
                    aside={
                      <button
                        type="button"
                        onClick={() => {
                          clearRecentQueries();
                          setRecents([]);
                        }}
                        className="-my-3 py-3 uppercase text-text-3 transition-colors hover:text-text-2"
                      >
                        Borrar
                      </button>
                    }
                  >
                    búsquedas recientes
                  </SectionTitle>
                </div>
              )}
              <ul className="flex flex-col">
                {shownRecents.map((r) => (
                  <li key={r} className="flex min-h-[52px] items-center gap-3.5 pl-5 pr-2">
                    <button
                      type="button"
                      onClick={() => setText(r)}
                      className="flex min-h-[52px] min-w-0 flex-1 items-center gap-3.5 text-left transition-opacity active:opacity-70"
                    >
                      <span className="text-text-2">
                        {typedOne ? <SearchGlyph /> : <RecentGlyph />}
                      </span>
                      <span className="truncate text-[16px] text-text">
                        {typedOne ? <Highlight text={r} query={q} /> : r}
                      </span>
                    </button>
                    {!typedOne && (
                      <button
                        type="button"
                        onClick={() => setRecents(removeRecentQuery(r))}
                        aria-label={`Quitar ${r}`}
                        className="flex h-11 w-11 flex-none items-center justify-center text-text-2"
                      >
                        <CloseGlyph />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {q.length === 0 && seen.length > 0 && (
            <section className="flex flex-col gap-3.5">
              <div className="px-5">
                <SectionTitle>vistos hace poco</SectionTitle>
              </div>
              <div className="bl-scroll flex items-end gap-3 overflow-x-auto px-5 pb-4">
                {seen.map((s) => (
                  <Link
                    key={s.catalogItemId}
                    href={`/item/${s.catalogItemId}`}
                    aria-label={s.title}
                    className="flex-none bl-press"
                  >
                    <Cover
                      posterUrl={s.posterUrl}
                      mediaType={s.mediaType}
                      alt={s.title}
                      radius="rounded-[var(--r-cover-s)]"
                      style={{ height: 96 }}
                    />
                  </Link>
                ))}
              </div>
            </section>
          )}

          {q.length === 0 && recents.length === 0 && seen.length === 0 && (
            <p className="px-5 text-[15px] leading-[1.5] text-text-2">
              Busca por título: películas, series y álbumes.
            </p>
          )}
        </div>
      )}

      {q.length >= MIN_QUERY && phase === "loading" && <SearchSkeleton />}

      {q.length >= MIN_QUERY && phase === "error" && (
        <div className="flex flex-col items-start gap-4 px-7 pt-[100px]">
          <span className="text-text-2">
            <TriangleGlyph size={22} />
          </span>
          <h2 className="font-display text-[32px] font-normal leading-[1.1] text-text text-balance">
            no pudimos buscar.
          </h2>
          <p className="text-[15px] leading-[1.5] text-text-2 text-pretty">
            Revisa tu conexión y vuelve a intentarlo.
          </p>
          <button type="button" onClick={retry} className={GLASS_BUTTON}>
            Reintentar
          </button>
        </div>
      )}

      {q.length >= MIN_QUERY && phase === "done" && results.length === 0 && (
        <div className="flex flex-col items-start gap-4 px-7 pt-[100px]">
          <h2 className="font-display text-[32px] font-normal leading-[1.1] text-text text-balance break-words">
            nada con “{q}”.
          </h2>
          <p className="text-[15px] leading-[1.5] text-text-2 text-pretty">
            {tab === "all"
              ? "Revisa cómo se escribe, o prueba con otro nombre."
              : "No hay nada en este formato. Prueba en todos."}
          </p>
          {tab !== "all" && (
            <button type="button" onClick={() => pickTab("all")} className={`${GLASS_BUTTON} pl-3`}>
              <SearchGlyph />
              Buscar en todo
            </button>
          )}
        </div>
      )}

      {q.length >= MIN_QUERY && phase === "done" && results.length > 0 && (
        <section className="flex flex-col gap-3.5 pt-[22px]">
          <div className="px-5">
            <SectionTitle aside={String(results.length)}>obras</SectionTitle>
          </div>
          <ul className="flex flex-col">
            {results.map((r) => {
              const saved = library.byTitle[r.catalogItemId]?.length ?? 0;
              return (
                <li key={r.catalogItemId} className="flex min-h-[84px] items-center gap-3.5 px-5">
                  <button
                    type="button"
                    onClick={() => openResult(r)}
                    className="flex min-w-0 flex-1 items-center gap-3.5 text-left transition-opacity active:opacity-70"
                  >
                    <RowCover posterUrl={r.posterUrl} paletteHex={r.paletteHex} mediaType={r.mediaType} />
                    <span className="flex min-w-0 flex-1 flex-col gap-[5px]">
                      <span className="truncate font-serif text-[18px] italic leading-[1.1] text-text">
                        {r.title}
                      </span>
                      <span className="truncate font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">
                        {workMeta(r)}
                      </span>
                    </span>
                  </button>
                  {saved > 0 ? (
                    <button
                      type="button"
                      onClick={() => onSave(r)}
                      aria-label={`${r.title}: guardado en ${saved}, cambiar colecciones`}
                      className="flex h-11 min-w-11 flex-none items-center justify-center rounded-full px-2 bl-press-sm"
                    >
                      <SavedCount n={saved} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSave(r)}
                      aria-label={`Guardar ${r.title}`}
                      className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-[var(--glass-bg)] text-text bl-press-sm hover:bg-white/[0.12]"
                    >
                      <PlusGlyph />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

/** E5 — the results' own shape (cover 44×66, two bars, the 44 Guardar), pulsing at 1.6 s. */
function SearchSkeleton() {
  return (
    <div aria-busy="true" aria-label="Buscando" className={`flex flex-col gap-1 px-5 pt-[26px] ${SKELETON_PULSE}`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex min-h-[84px] items-center gap-3.5">
          <span className="flex w-12 flex-none justify-center">
            <span className="block h-[66px] w-11 rounded-[var(--r-cover-s)] bg-surface-1" />
          </span>
          <span className="flex flex-1 flex-col gap-2.5">
            <span className="block h-4 w-[70%] rounded-[6px] bg-surface-1" />
            <span className="block h-2.5 w-[45%] rounded-[5px] bg-surface-1" />
          </span>
          <span className="h-11 w-11 flex-none rounded-full bg-surface-1" />
        </div>
      ))}
    </div>
  );
}

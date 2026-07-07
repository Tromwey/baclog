"use client";

import { useState, useTransition } from "react";
import { addItemAction } from "@/app/actions/backlog-item-actions";
import type { Suggestion } from "@/modules/recs/similar";

/** F2.20 — presented as AI, added in one tap. */
export function SuggestionRail({
  backlogId,
  suggestions,
}: {
  backlogId: string;
  suggestions: Suggestion[];
}) {
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  if (suggestions.length === 0) return null;

  function add(catalogItemId: string) {
    setAddedIds((prev) => new Set(prev).add(catalogItemId));
    startTransition(() =>
      addItemAction({ backlogId, catalogItemId }).then(() => {}),
    );
  }

  return (
    <section className="mt-8">
      <h2 className="mb-2 font-mono text-xs font-bold uppercase tracking-widest text-text-3">
        ✨ Sugerencias IA para este backlog
      </h2>
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2">
        {suggestions.map((s) => (
          <div key={s.catalogItemId} className="w-28 shrink-0">
            <div className="relative">
              {s.posterUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- hotlinked external CDN (ADR-007)
                <img
                  src={s.posterUrl}
                  alt={s.title}
                  className="aspect-[2/3] w-full rounded-lg object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex aspect-[2/3] w-full items-center justify-center rounded-lg bg-surface-2 text-xl">
                  {s.mediaType === "album" ? "♫" : "▶"}
                </div>
              )}
              <button
                onClick={() => add(s.catalogItemId)}
                disabled={addedIds.has(s.catalogItemId)}
                aria-label={`Agregar ${s.title}`}
                className="absolute bottom-1.5 right-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-accent font-bold text-bg shadow disabled:bg-completed disabled:text-white"
              >
                {addedIds.has(s.catalogItemId) ? "✓" : "+"}
              </button>
            </div>
            <p className="mt-1 truncate text-xs">{s.title}</p>
            <p className="truncate text-[10px] text-text-3">
              {[s.byline, s.year].filter(Boolean).join(" · ")}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

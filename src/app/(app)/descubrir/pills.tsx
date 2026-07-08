"use client";

import { MEDIA_TYPES, type MediaType } from "@/modules/catalog/types";

// Plural, sentence-case labels — deliberately different copy from the mono
// UPPERCASE MEDIA_TYPE_LABEL badges used elsewhere.
const LABEL: Record<MediaType, string> = {
  film: "Películas",
  series: "Series",
  album: "Música",
};

/**
 * Type filter for Descubrir. These FILTER the results (search + recos) by media
 * type — they do NOT feed the LLM prompt. Shared by the entry screen and the
 * search panel so the selection persists across both.
 */
export function Pills({
  selected,
  onToggle,
}: {
  selected: Record<MediaType, boolean>;
  onToggle: (t: MediaType) => void;
}) {
  return (
    <div className="flex gap-2">
      {MEDIA_TYPES.map((t) => {
        const on = selected[t];
        return (
          <button
            key={t}
            onClick={() => onToggle(t)}
            aria-pressed={on}
            className={`inline-flex items-center rounded-full border px-[15px] py-2.5 font-sans text-[13px] font-semibold transition-colors ${
              on
                ? "border-line bg-accent/15 text-accent backdrop-blur-[8px]"
                : "border-line bg-surface-2 text-text-2"
            }`}
          >
            {LABEL[t]}
          </button>
        );
      })}
    </div>
  );
}

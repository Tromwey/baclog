import Link from "next/link";
import { pad } from "@/lib/format";
import type { MediaType } from "@/modules/cards/types";
import { ItemSignalGlyph } from "./item-signal-glyph";

/**
 * Read-only backlog/lens row (HANDOFF §2): mono index · signal glyph · obra
 * title · media tag · chevron. Rows never edit inline — the gesture model is
 * tap-en-el-cuerpo = reproducir (deep-link via /api/links/resolve) and
 * chevron › = abrir el detalle/ticket. The two targets are SIBLINGS in a flex
 * row (an <a> can't nest another <a>). Server-safe: no hooks, no handlers.
 */

/** Media tag copy (Spanish, rendered uppercase by the mono-meta style). */
const MEDIA_LABEL: Record<MediaType, string> = {
  film: "Film",
  series: "Serie",
  album: "Álbum",
};

export interface ItemRowReadonlyProps {
  /** 1-based position; lens views keep it RUNNING across groups. */
  index: number;
  catalogItemId: string;
  title: string;
  mediaType: MediaType;
  verdict: "disliked" | "liked" | null;
  obsessed: boolean;
  sourceCrossMediaRecId: string | null;
}

export function ItemRowReadonly({
  index,
  catalogItemId,
  title,
  mediaType,
  verdict,
  obsessed,
  sourceCrossMediaRecId,
}: ItemRowReadonlyProps) {
  return (
    <div className="flex h-[58px] items-center gap-3 pl-5 pr-1.5">
      {/* tap-body = reproducir: resolve to the user's streaming deep-link */}
      <a
        href={`/api/links/resolve?catalogItemId=${catalogItemId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        <span className="w-[18px] flex-none font-mono text-[13px] tracking-[0.02em] text-text-3">
          {pad(index)}
        </span>
        <ItemSignalGlyph
          verdict={verdict}
          obsessed={obsessed}
          sourceCrossMediaRecId={sourceCrossMediaRecId}
        />
        <span className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className="truncate font-serif text-xl italic text-text">
            {title}
          </span>
          <span className="flex-none font-mono text-[8px] uppercase tracking-[0.1em] text-text-3">
            {MEDIA_LABEL[mediaType]}
          </span>
        </span>
      </a>
      {/* chevron = el ticket del ítem */}
      <Link
        href={`/item/${catalogItemId}`}
        aria-label={`Abrir ${title}`}
        className="flex h-11 w-11 flex-none items-center justify-center text-text-3 transition-colors hover:text-text"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M9 5l7 7-7 7"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Link>
    </div>
  );
}

"use client";

import { useParams } from "next/navigation";
import { SKELETON_PULSE } from "@/components/kura/components";

/**
 * Lens skeleton — the lens page's silhouette (‹ back · glyph+title hero · meta
 * line · one "de …" group header · ItemRowReadonly rows) shown while
 * getLensItems streams in. Mirrors the real page's paddings so the swap
 * doesn't jump.
 *
 * Client only to read the segment: loading UI gets no params, and the hero's
 * 26 glyph (which shifts the title 36 px) exists for obsesiones and
 * completados only — keep this list in step with LENSES in page.tsx.
 * One shared pulse (opacity only) — no spinners (item loading.tsx idiom).
 */
const WITH_GLYPH = new Set(["obsesiones", "completados"]);

export default function Loading() {
  const { kind } = useParams<{ kind: string }>();
  return (
    <main className="relative mx-auto min-h-dvh w-full max-w-md pb-dock-clearance">
      <div aria-busy="true" aria-label="Cargando" className={SKELETON_PULSE}>
        {/* top bar silhouette: ‹ back chip */}
        <div className="flex items-center justify-between px-6 pt-[max(64px,calc(20px+env(safe-area-inset-top)))]">
          <div className="h-11 w-11 rounded-full bg-[var(--glass-bg)]" />
        </div>

        {/* hero: glyph + Newsreader 36 × 1.02 title, then the mono 11 meta line */}
        <div className="px-5 pt-[22px]">
          <div className="flex items-center gap-2.5">
            {WITH_GLYPH.has(kind) && <div className="h-[26px] w-[26px] rounded-full bg-surface-1" />}
            <div className="h-[37px] w-1/2 rounded-xl bg-surface-1" />
          </div>
          <div className="mt-2.5 flex h-[16.5px] items-center">
            <div className="h-2.5 w-2/5 rounded-full bg-surface-1" />
          </div>
        </div>

        <div className="mt-3.5">
          {/* group header: "de <colección>" + the hairline */}
          <div className="flex items-center gap-2 px-5 pb-1 pt-4">
            <div className="flex h-[16.5px] items-center">
              <div className="h-2.5 w-24 rounded-full bg-surface-1" />
            </div>
            <span className="h-px flex-1 bg-line/60" />
          </div>
          {/* ItemRowReadonly: index 18 · glyph slot 18 · title · 44 chevron */}
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex h-[58px] items-center gap-3 pl-5 pr-1.5">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="h-3 w-[18px] flex-none rounded bg-surface-1" />
                <span className="w-[18px] flex-none" />
                <div className="h-4 flex-1 rounded-full bg-surface-1" />
              </div>
              <span className="h-11 w-11 flex-none" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

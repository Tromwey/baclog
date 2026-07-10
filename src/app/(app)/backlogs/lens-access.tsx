"use client";

import Link from "next/link";
import { useState } from "react";
import { FLAME_PATH, GLYPH_VIEWBOX } from "@/components/glyph-paths";

/**
 * Header access to the smart lenses (HANDOFF §4, mock #p1): the flame goes
 * straight to Obsesiones; the chevron drops the other three. Lenses are
 * auto-generated filters, not shelves — that's why they live as header
 * actions instead of shelf cards. Top-anchored dropdown: the dock is at the
 * bottom, so no portal needed here (unlike the ⋯ menu panels).
 */

const DROPDOWN_LENSES = [
  { href: "/backlogs/lentes/en-progreso", label: "En progreso" },
  { href: "/backlogs/lentes/en-el-radar", label: "En el radar" },
  { href: "/backlogs/lentes/completados", label: "Completados" },
] as const;

export function LensAccess() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative flex shrink-0 gap-2">
      <Link
        href="/backlogs/lentes/obsesiones"
        aria-label="Lente Obsesiones"
        className="flex h-10 w-10 items-center justify-center rounded-full bg-hot/[0.14] text-hot transition-colors hover:bg-hot/[0.24]"
      >
        <svg
          width="18"
          height="18"
          viewBox={GLYPH_VIEWBOX}
          fill="currentColor"
          aria-hidden
        >
          <path d={FLAME_PATH} />
        </svg>
      </Link>
      <button
        onClick={() => setOpen(!open)}
        aria-label="Más lentes"
        aria-expanded={open}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.07] text-text-2 transition-colors hover:bg-white/[0.12]"
      >
        <svg
          className={`transition-transform ${open ? "rotate-180" : ""}`}
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
        >
          <path
            d="M6 9l6 6 6-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div className="bl-rise absolute right-0 top-[52px] z-20 w-44 overflow-hidden rounded-[20px] bg-surface-2/90 py-1.5 shadow-[var(--shadow-card)] backdrop-blur-[28px] backdrop-saturate-[1.25]">
          {DROPDOWN_LENSES.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 text-sm hover:bg-white/5"
            >
              {label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

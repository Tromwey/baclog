"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin", label: "PULSO" },
  { href: "/admin/usuarios", label: "USUARIOS" },
  { href: "/admin/trafico", label: "TRÁFICO" },
  { href: "/admin/recos", label: "RECOS" },
  { href: "/admin/salud", label: "SALUD" },
  { href: "/admin/resenas", label: "RESEÑAS" },
];

/**
 * The tab strip. Active = fill change (no borders, no glow).
 *
 * Six destinations since F3.9: the label drops to 9px and the horizontal
 * padding to 2px, which is what keeps TRÁFICO and USUARIOS on one line at
 * 390px. Everything else about the strip is unchanged.
 */
export function AdminTabs() {
  const pathname = usePathname();
  return (
    <div className="grid grid-cols-6 gap-1 pb-3">
      {TABS.map((tab) => {
        const active =
          tab.href === "/admin"
            ? pathname === "/admin"
            : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-[10px] px-[2px] py-[10px] text-center font-mono text-[9px] tracking-[0.02em] transition-colors ${
              active ? "bg-accent text-bg" : "text-text-3 hover:bg-surface-2"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

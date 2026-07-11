"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin", label: "PULSO" },
  { href: "/admin/usuarios", label: "USUARIOS" },
  { href: "/admin/trafico", label: "TRÁFICO" },
  { href: "/admin/recos", label: "RECOS" },
  { href: "/admin/salud", label: "SALUD" },
];

/** The 5-destination tab strip. Active = fill change (no borders, no glow). */
export function AdminTabs() {
  const pathname = usePathname();
  return (
    <div className="grid grid-cols-5 gap-[5px] pb-3">
      {TABS.map((tab) => {
        const active =
          tab.href === "/admin"
            ? pathname === "/admin"
            : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-[10px] px-[3px] py-[10px] text-center font-mono text-[10px] tracking-[0.03em] transition-colors ${
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

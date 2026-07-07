"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Search, Settings, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const LINKS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/backlogs", label: "Backlogs", icon: LayoutGrid },
  { href: "/search", label: "Buscar", icon: Search },
  { href: "/recap", label: "Recap", icon: Sparkles },
  { href: "/settings", label: "Ajustes", icon: Settings },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg/95 backdrop-blur-[var(--glass-blur)]">
      <div className="mx-auto flex max-w-md">
        {LINKS.map((l) => {
          const active = pathname.startsWith(l.href);
          const Icon = l.icon;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] transition-colors ${
                active ? "text-accent" : "text-text-3 hover:text-text-2"
              }`}
            >
              <Icon size={20} strokeWidth={active ? 2.4 : 2} />
              {l.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

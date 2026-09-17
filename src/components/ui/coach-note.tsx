import type { ReactNode } from "react";

/**
 * A first-run coach mark: a content hairline and one mono line, in the same
 * voice as the metadata lines so it reads as part of the surface rather than
 * a tooltip bolted on top (AGENTS §7: coach-mark hairlines are exempt from
 * the borderless rule). Server-safe; the item page wraps it in a client
 * component that reacts to the row.
 *
 * `label` is the emphasized lead ("Primer uso") — the rest is the note.
 */
export function CoachNote({
  label = "Primer uso",
  className = "",
  children,
}: {
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`bl-rise relative ${className}`}>
      <div className="h-px bg-line" />
      <div className="mt-4 flex gap-2.5 font-mono text-[10px] uppercase tracking-[0.14em]">
        <span className="flex-none text-text-2">{label}</span>
        <div className="min-w-0 leading-[1.7] text-text-3">{children}</div>
      </div>
    </div>
  );
}

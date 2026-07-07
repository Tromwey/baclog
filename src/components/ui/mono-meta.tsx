import type { ComponentPropsWithoutRef } from "react";

/**
 * mono-meta label (sistema-diseno §3). The "data voice": Space Mono,
 * UPPERCASE, wide tracking. This is the ONLY place uppercase is allowed —
 * it makes caps feel systemic (timestamps, status labels, receipt headers),
 * never decorative. Defaults to text-3 (metadata/watermark tier).
 */
export function MonoMeta({
  className = "",
  children,
  ...rest
}: ComponentPropsWithoutRef<"span">) {
  return (
    <span
      className={`font-mono text-xs uppercase tracking-[0.08em] text-text-3 ${className}`}
      {...rest}
    >
      {children}
    </span>
  );
}

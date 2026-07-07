import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

/**
 * Design-system button (sistema-diseno §4). Three variants:
 *  - primary   lima fill + black text — the "marquee light" CTA
 *  - secondary transparent + hairline
 *  - ghost     text-only (skip / later)
 * Renders as <Link> when `href` is set, else <button>. Shared classes keep
 * the pill radius, press-scale, and lima focus glow consistent everywhere.
 */

export type ButtonVariant = "primary" | "secondary" | "ghost";

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-bg shadow-[0_0_24px_var(--accent-soft)] active:bg-accent-press hover:brightness-105",
  secondary:
    "bg-transparent text-text border border-line hover:bg-surface-2",
  ghost: "bg-transparent text-text-2 hover:text-text",
};

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 " +
  "font-sans font-semibold text-base leading-none transition-all " +
  "duration-[var(--dur-fast)] ease-[var(--ease-out)] " +
  "active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none " +
  "focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2";

type CommonProps = {
  variant?: ButtonVariant;
  className?: string;
  children: ReactNode;
};

type ButtonAsButton = CommonProps &
  Omit<ComponentPropsWithoutRef<"button">, keyof CommonProps | "href"> & {
    href?: undefined;
  };

type ButtonAsLink = CommonProps &
  Omit<ComponentPropsWithoutRef<typeof Link>, keyof CommonProps> & {
    href: string;
  };

export function Button(props: ButtonAsButton | ButtonAsLink) {
  const { variant = "primary", className = "", children, ...rest } = props;
  const cls = `${BASE} ${VARIANT[variant]} ${className}`;

  if ("href" in rest && rest.href !== undefined) {
    return (
      <Link className={cls} {...(rest as ButtonAsLink)}>
        {children}
      </Link>
    );
  }
  return (
    <button className={cls} {...(rest as ButtonAsButton)}>
      {children}
    </button>
  );
}

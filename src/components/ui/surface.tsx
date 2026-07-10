import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

/**
 * Card / raised surface primitive (sistema-diseno §2, §4; HANDOFF §7: flat,
 * borderless — the fill IS the card). `interactive` adds the hover lift used
 * by tappable grid tiles. Polymorphic via `as` so it can be a Link, article,
 * etc. without wrapping.
 */
export function Surface<T extends ElementType = "div">({
  as,
  interactive = false,
  className = "",
  children,
  ...rest
}: {
  as?: T;
  interactive?: boolean;
  className?: string;
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "className" | "children">) {
  const Tag = (as ?? "div") as ElementType;
  return (
    <Tag
      className={`rounded-[var(--r-lg)] bg-surface-1 ${
        interactive
          ? "transition-colors duration-[var(--dur-base)] ease-[var(--ease-out)] hover:bg-surface-2"
          : ""
      } ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );
}

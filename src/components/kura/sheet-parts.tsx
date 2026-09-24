import Link from "next/link";
import type { ReactNode } from "react";
import { SheetClose } from "@/components/ui/sheet";
import { KIcon, type KIconName } from "./icons";

/**
 * The inside of a Kura sheet (flujos-v2 · 02–05), so every sheet in the app
 * reads the same: the title in Newsreader 26 lowercase (with the 36 px glass
 * close chip when the sheet is a form), menu rows of 54 with a 24 px icon
 * column, choice rows with a 26 px radio, and the solid action that closes
 * the flow. Server-safe (SheetClose is its own client leaf).
 */

/** "nueva colección" / "renombrar" + the close chip. */
export function SheetTitle({
  children,
  close = true,
  className = "",
}: {
  children: ReactNode;
  close?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 pb-1.5 ${className}`}>
      <h2 className="min-w-0 font-brand text-[26px] font-normal leading-[1.1] text-text [text-wrap:balance]">
        {children}
      </h2>
      {close && (
        <SheetClose
          aria-label="Cerrar"
          className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-[var(--glass-bg)] text-text bl-press-sm"
        >
          <KIcon name="close" size={16} />
        </SheetClose>
      )}
    </div>
  );
}

const ROW =
  "flex min-h-[54px] w-full items-center gap-3.5 rounded-[var(--r-surface)] px-2.5 text-left font-sans text-[16px] font-medium text-text transition-colors active:bg-white/[0.06] disabled:opacity-40";

/** A menu row (18a Más, 18c, the card's hold sheet). Link when `href`. */
export function MenuRow({
  icon,
  label,
  aside,
  href,
  onClick,
  disabled,
}: {
  icon: KIconName | ReactNode;
  label: ReactNode;
  /** Mono value at the right (MANUAL · PÚBLICA · ME OBSESIONA). */
  aside?: ReactNode;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const body = (
    <>
      <span className="flex w-6 flex-none justify-center">
        {typeof icon === "string" ? <KIcon name={icon as KIconName} size={18} /> : icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {aside && (
        <span className="flex-none font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">
          {aside}
        </span>
      )}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={ROW}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={ROW}>
      {body}
    </button>
  );
}

/** The 8 px breath between row groups in a menu. */
export function MenuGap() {
  return <span aria-hidden className="block h-2" />;
}

/** The radio: filled `--text` with the check when on, a quiet ring when off. */
export function RadioMark({ on }: { on: boolean }) {
  return on ? (
    <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full bg-text">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="#0b0b0d" aria-hidden>
        <path d="M20.5 6.3a1.1 1.1 0 010 1.6l-9.6 9.6a1.1 1.1 0 01-1.6 0L4.6 12.8a1.1 1.1 0 011.6-1.6l3.9 3.9 8.8-8.8a1.1 1.1 0 011.6 0z" />
      </svg>
    </span>
  ) : (
    // The ring IS the radio glyph (the frames draw it at 1.5 px .24), not a
    // border on a surface — drawn as an inset shadow so no `border-*` ships.
    <span className="h-[26px] w-[26px] flex-none rounded-full shadow-[inset_0_0_0_1.5px_rgba(244,243,238,.24)]" />
  );
}

/** A choice row (K1a Quién la ve, O3a Ordenar). */
export function ChoiceRow({
  icon,
  label,
  description,
  on,
  onSelect,
  disabled,
}: {
  /** 40 px glass tile with an 18 px glyph (K1a); omit for text-only (O3a). */
  icon?: ReactNode;
  label: ReactNode;
  description?: ReactNode;
  on: boolean;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      disabled={disabled}
      onClick={onSelect}
      className={`flex w-full items-center gap-3.5 rounded-[var(--r-surface)] px-1 text-left transition-colors active:bg-white/[0.04] disabled:opacity-40 ${
        icon ? "min-h-[68px]" : "min-h-14"
      }`}
    >
      {icon && (
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[12px] bg-[var(--glass-bg)] text-text">
          {icon}
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="font-sans text-[16px] font-medium text-text">{label}</span>
        {description && (
          <span className="font-sans text-[13px] leading-[1.4] text-text-2">{description}</span>
        )}
      </span>
      <RadioMark on={on} />
    </button>
  );
}

/** Sólido — the action that closes the sheet (Crear, Guardar, Mover). */
export const SHEET_SOLID =
  "flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-text px-5 font-sans text-[16px] font-semibold text-bg bl-press disabled:pointer-events-none disabled:opacity-40";

/** The quiet second action under a solid one (Cancelar). */
export const SHEET_QUIET =
  "flex min-h-[52px] w-full items-center justify-center rounded-full px-5 font-sans text-[16px] font-medium text-text transition-opacity active:opacity-60";

/** The field inside a sheet (O2a/O2b): glass, radius 16, 52 tall, the name in Newsreader 20. */
export const SHEET_FIELD =
  "h-[52px] w-full rounded-[16px] bg-[var(--glass-bg)] px-[18px] font-brand text-[20px] text-text outline-none transition-colors placeholder:font-sans placeholder:text-[16px] placeholder:text-text-3 focus:bg-white/[0.11]";

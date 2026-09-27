import type { ReactNode } from "react";
import type { FanCover } from "@/modules/backlog/fan";
import { Fan } from "./fan";
import { KIcon } from "./icons";
import { RadioMark } from "./sheet-parts";

/**
 * A collection in a picker (Colecciones formalizado · 7a — "guardar en",
 * "mover a", search's destination): its mini fan at 51 instead of a
 * thumbnail, the name in Newsreader 18, "N títulos" in mono, and the check
 * disc. 72 tall. Server-safe; the caller owns the state.
 */
export function FanPickRow({
  name,
  covers,
  count,
  on,
  onClick,
  note,
  disabled,
  role = "checkbox",
}: {
  name: string;
  covers: readonly FanCover[];
  count: number;
  on: boolean;
  onClick: () => void;
  /** "ya está" / "aquí está" after the count. */
  note?: string;
  disabled?: boolean;
  role?: "checkbox" | "option" | "radio";
}) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={role === "option" ? undefined : on}
      aria-selected={role === "option" ? on : undefined}
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-[72px] w-full items-center gap-3.5 rounded-[18px] px-2 text-left transition-colors hover:bg-white/[0.04] active:bg-white/[0.06] disabled:opacity-45"
    >
      <Fan covers={covers} lead={51} />
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="truncate font-brand text-[18px] text-text">{name}</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-2">
          {count} {count === 1 ? "título" : "títulos"}
          {note && ` · ${note}`}
        </span>
      </span>
      <RadioMark on={on} />
    </button>
  );
}

/** "Nueva colección" as the first row of a picker: the "+" in the fan's column. */
export function NewCollectionRow({ onClick, children = "Nueva colección" }: { onClick: () => void; children?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-16 w-full items-center gap-3.5 rounded-[18px] px-2 text-left transition-opacity active:opacity-70"
    >
      <span className="flex w-[68px] flex-none justify-center text-text-2">
        <KIcon name="plus" size={20} />
      </span>
      <span className="flex-1 font-sans text-[16px] font-medium text-text">{children}</span>
    </button>
  );
}

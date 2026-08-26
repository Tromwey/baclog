"use client";

import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";

const HANDLE_RE = /^[a-z0-9_.]{3,30}$/;

/**
 * F3.10 — "O busca a alguien por su @handle" (design 1b's footer). The line is
 * the affordance: tapping it swaps in a small mono input in place, and
 * submitting navigates to that profile (/u/*, which 404s identically for
 * private and nonexistent — nothing to enumerate here).
 */
export function HandleSearch() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const handle = value.trim().toLowerCase().replace(/^@/, "");
  const valid = HANDLE_RE.test(handle);

  if (!open) {
    return (
      <button
        onClick={() => {
          // Mount synchronously and focus INSIDE the tap's task — iOS only
          // raises the keyboard for a same-task focus (the Descubrir lesson).
          flushSync(() => setOpen(true));
          inputRef.current?.focus();
        }}
        className="mt-[18px] block w-full text-center font-mono text-[9.5px] uppercase tracking-[0.1em] text-text-3 transition-colors hover:text-text-2"
      >
        O busca a alguien por su @handle
      </button>
    );
  }

  return (
    <form
      className="mt-[18px] flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) router.push(`/u/${handle}`);
      }}
    >
      <div className="flex flex-1 items-center gap-1 rounded-full bg-surface-3 px-4 py-[11px]">
        <span className="font-mono text-[13px] text-text-3">@</span>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="handle"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="w-full bg-transparent font-mono text-[13px] lowercase text-text outline-none placeholder:text-text-3"
        />
      </div>
      <button
        type="submit"
        disabled={!valid}
        className="flex-none rounded-full bg-surface-2 px-4 py-[11px] font-sans text-[13px] font-semibold leading-none text-text transition-opacity disabled:opacity-40"
      >
        Ir
      </button>
    </form>
  );
}

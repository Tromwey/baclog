"use client";

import { useRef, useState } from "react";
import { attempt, WRITE_FAILED } from "@/components/kura/attempt";

/**
 * A setting that applies AT ONCE (a switch, a radio row): the control moves
 * with the tap, the write follows, and a failure puts back the last value the
 * server actually accepted and says so.
 *
 * `saved` is that last accepted value; `latest` numbers the taps, so only the
 * tap that still owns the screen may put a value back — a slow failure of an
 * older tap never undoes a newer choice.
 *
 * Returns `[value, pick, error]`.
 */
export function useOptimisticChoice<T>(initial: T, save: (next: T) => Promise<unknown>) {
  const [value, setValue] = useState<T>(initial);
  const [error, setError] = useState<string | null>(null);
  const saved = useRef(initial);
  const latest = useRef(0);

  async function pick(next: T) {
    const mine = ++latest.current;
    setValue(next);
    setError(null);
    const res = await attempt(() => save(next));
    if (res.ok) {
      saved.current = next;
      return;
    }
    if (latest.current !== mine) return;
    setValue(saved.current);
    setError(WRITE_FAILED);
  }

  return [value, pick, error] as const;
}

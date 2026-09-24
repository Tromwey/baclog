"use client";

import { useState, useTransition } from "react";
import { followUserAction } from "@/app/actions/social-actions";

/**
 * E1 "Seguir a los 3" — the honey action of the empty feed (the one honey of
 * the screen; the rows below follow one by one in glass). Follows everyone
 * offered in parallel; each follow revalidates /feed, so the page re-renders
 * into its next state by itself (no-activity or the stack). A partial failure
 * says so and keeps the button for another try — never a silent half-follow.
 */
export function FollowAllButton({ usernames }: { usernames: string[] }) {
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  function followAll() {
    setFailed(false);
    startTransition(async () => {
      const results = await Promise.allSettled(usernames.map((u) => followUserAction(u)));
      const ok = results.every((r) => r.status === "fulfilled" && !("error" in r.value));
      if (!ok) setFailed(true);
    });
  }

  const n = usernames.length;
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={followAll}
        disabled={pending}
        className="inline-flex h-[52px] w-full items-center justify-center rounded-full bg-honey px-5 font-sans text-[16px] font-semibold text-bg bl-press active:bg-honey-press disabled:opacity-60"
      >
        {pending ? "Siguiendo…" : n === 1 ? "Seguir" : `Seguir a los ${n}`}
      </button>
      {failed && (
        <p role="status" className="text-[13px] leading-[1.4] text-text-2">
          No se pudo seguir a todos. Vuelve a intentarlo.
        </p>
      )}
    </div>
  );
}

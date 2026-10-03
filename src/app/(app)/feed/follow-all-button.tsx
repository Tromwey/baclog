"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { followUserAction } from "@/app/actions/social-actions";
import { attempt, ONBOARDING_EXIT_LABEL, ONBOARDING_TO_FOLLOW } from "@/components/kura/attempt";

/**
 * E1 "Seguir a los 3" — the honey action of the empty feed (the one honey of
 * the screen; the rows below follow one by one in glass). Follows everyone
 * offered in parallel; each follow revalidates /feed, so the page re-renders
 * into its next state by itself (no-activity or the stack). A partial failure
 * says so and keeps the button for another try — never a silent half-follow.
 */
export function FollowAllButton({ usernames }: { usernames: string[] }) {
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState<"some" | "onboarding" | null>(null);

  function followAll() {
    setFailed(null);
    startTransition(async () => {
      const results = await Promise.all(
        usernames.map((u) => attempt(() => followUserAction(u))),
      );
      // F2.2: without a finished sign-up every follow is refused, and a retry
      // would be refused again — say what to do instead.
      if (results.some((r) => !r.ok && r.error === "onboarding_required")) {
        setFailed("onboarding");
      } else if (results.some((r) => !r.ok)) {
        setFailed("some");
      }
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
      {failed === "some" && (
        <p role="alert" className="text-[13px] leading-[1.4] text-text-2">
          No se pudo seguir a todos. Vuelve a intentarlo.
        </p>
      )}
      {failed === "onboarding" && (
        <p role="alert" className="text-[13px] leading-[1.4] text-text-2">
          {ONBOARDING_TO_FOLLOW}{" "}
          <Link
            href="/onboarding"
            className="font-medium text-text underline underline-offset-2 transition-opacity active:opacity-60"
          >
            {ONBOARDING_EXIT_LABEL}
          </Link>
        </p>
      )}
    </div>
  );
}

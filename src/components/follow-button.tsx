"use client";

import { useState, useTransition } from "react";
import {
  followUserAction,
  unfollowUserAction,
} from "@/app/actions/social-actions";

/**
 * F3.10 — the one follow control, everywhere a public profile can be followed
 * (its hero, the feed's suggestion cards, the siguiendo/seguidores rows).
 * Optimistic: the chip flips on tap and only reverts if the server says no.
 * Two fills, per the design: lima pill = "Seguir" (the action), neutral
 * surface + accent check = "Siguiendo" (the state). No borders, no glow (§7).
 */

const SIZES = {
  sm: "px-[15px] py-2 text-[12.5px]",
  md: "px-4 py-[9px] text-[13px]",
  lg: "px-[18px] py-[11px] text-[14.5px]",
} as const;

const ACCENT_PILL =
  "inline-flex flex-none items-center rounded-full bg-accent font-sans font-semibold leading-none text-bg transition-all active:scale-[0.97] active:bg-accent-press";

/**
 * The lima "Seguir" pill as a plain class, for the ANONYMOUS variant on the
 * public profile (a Link to /login) — same slot, same fill, same press state
 * as the real button, so the logged-out conversion path can't drift from it.
 */
export const followPillClass = `${ACCENT_PILL} ${SIZES.lg}`;

export function FollowButton({
  username,
  initialFollowing,
  size = "md",
  className = "",
}: {
  username: string;
  initialFollowing: boolean;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const [following, setFollowing] = useState(initialFollowing);
  const [, startTransition] = useTransition();

  function toggle() {
    const next = !following;
    setFollowing(next);
    startTransition(async () => {
      // The try/catch is the load-bearing part: an action can REJECT (expired
      // session throwing UnauthorizedError, network drop, stale build), not
      // just return {error} — and /u/* has no error boundary, so an unhandled
      // rejection would replace the whole profile with the default error page
      // while the chip stayed optimistically flipped.
      try {
        const result = next
          ? await followUserAction(username)
          : await unfollowUserAction(username);
        if ("error" in result) setFollowing(!next);
      } catch {
        setFollowing(!next);
      }
    });
  }

  if (following) {
    return (
      <button
        onClick={toggle}
        className={`inline-flex flex-none items-center gap-1.5 rounded-full bg-surface-2 font-sans font-semibold leading-none text-text transition-colors hover:bg-surface-3 ${SIZES[size]} ${className}`}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
          className="flex-none"
        >
          <path
            d="M5 13l4.5 4.5L19 7"
            stroke="var(--accent)"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Siguiendo
      </button>
    );
  }

  return (
    <button
      onClick={toggle}
      className={`${ACCENT_PILL} ${SIZES[size]} ${className}`}
    >
      Seguir
    </button>
  );
}

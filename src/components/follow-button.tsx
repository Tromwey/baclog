"use client";

import { HERO_PILL } from "./follow-pill";
import { useState, useTransition } from "react";
import {
  followUserAction,
  unfollowUserAction,
} from "@/app/actions/social-actions";

/**
 * F3.10 — the one follow control, everywhere a public profile can be followed
 * (its hero, the feed's suggestion cards, the siguiendo/seguidores rows).
 * Optimistic: the chip flips on tap and only reverts if the server says no.
 * No borders, no glow (§7).
 *
 * Three variants, all the same optimistic toggle underneath:
 *  - `accent` — the lima pill = "Seguir", neutral surface + check =
 *    "Siguiendo" (people rows).
 *  - `glass` — feed v3's suggestion card: off-white pill that turns into the
 *    glass when following, 9/18 padding, 13px semibold.
 *  - `hero` — the public profile's button (Revamp UI screen 10, 2026-09-03):
 *    fills its half of the row, off-white pill (`text` on `bg`), Hanken 600
 *    14, 13px vertical padding; following = the app's glass fill.
 */

const SIZES = {
  sm: "px-[15px] py-2 text-[12.5px]",
  md: "px-4 py-[9px] text-[13px]",
  lg: "px-[18px] py-[11px] text-[14.5px]",
} as const;

const ACCENT_PILL =
  "inline-flex flex-none items-center rounded-full bg-accent font-sans font-semibold leading-none text-bg transition-all active:scale-[0.97] active:bg-accent-press";

const GLASS_PILL =
  "inline-flex flex-none items-center rounded-full px-[18px] py-[9px] font-sans text-[13px] font-semibold leading-none backdrop-blur-[16px] transition-[background-color,color] duration-200 active:scale-[0.97]";

export function FollowButton({
  username,
  initialFollowing,
  size = "md",
  variant = "accent",
  className = "",
}: {
  username: string;
  initialFollowing: boolean;
  size?: keyof typeof SIZES;
  variant?: "accent" | "glass" | "hero";
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

  if (variant === "hero") {
    return (
      <button
        onClick={toggle}
        className={`${HERO_PILL} ${
          following ? "bg-[var(--glass-bg)] text-text" : "bg-text text-bg"
        } ${className}`}
      >
        {following ? "Siguiendo" : "Seguir"}
      </button>
    );
  }

  if (variant === "glass") {
    return (
      <button
        onClick={toggle}
        className={`${GLASS_PILL} ${
          following ? "bg-[rgba(18,18,24,.38)] text-text" : "bg-text text-bg"
        } ${className}`}
      >
        {following ? "Siguiendo" : "Seguir"}
      </button>
    );
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

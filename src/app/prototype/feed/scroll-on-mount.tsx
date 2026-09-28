"use client";

import { useEffect } from "react";

/** Feed lab: scrolls the stack's scroller to `top` once mounted (`?scroll=`). */
export function ScrollOnMount({ top }: { top: number }) {
  useEffect(() => {
    const t = setTimeout(() => {
      document.querySelector<HTMLElement>(".bl-scroll")?.scrollTo({ top });
    }, 400);
    return () => clearTimeout(t);
  }, [top]);
  return null;
}

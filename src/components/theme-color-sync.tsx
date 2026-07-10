"use client";

import { useEffect } from "react";
import { mixToward } from "@/lib/color";

/** Root fallback — keep in sync with viewport.themeColor in app/layout.tsx. */
const BASE = "#0B0B0D";
const BASE_RGB = { r: 0x0b, g: 0x0b, b: 0x0d };

/**
 * Blend a palette color toward the app bg so the tint stays "status-bar dark"
 * while carrying the aura's hue. `amount` = how much of the color survives
 * (malformed input collapses to BASE via mixToward's fallback).
 */
function darken(hex: string, amount = 0.28): string {
  return mixToward(hex, BASE_RGB, 1 - amount);
}

/**
 * In-browser Safari can NEVER render page pixels behind the OS status bar —
 * only a solid tint taken from <meta name="theme-color">. With the app's flat
 * #0B0B0D that band reads as a hard black cut above any aura hero. This syncs
 * the meta to a darkened version of the current screen's dominant aura color
 * on mount and restores the base on unmount, so the status-bar band blends
 * with the aura instead of chopping it. (Home-screen installs don't need
 * this — black-translucent lets the real aura bleed underneath.)
 */
export function ThemeColorSync({ color }: { color: string | null | undefined }) {
  useEffect(() => {
    if (!color) return;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.content = darken(color);
    return () => {
      meta.content = BASE;
    };
  }, [color]);

  return null;
}

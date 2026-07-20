import type { MetadataRoute } from "next";

/**
 * PWA web app manifest (F3.7 followup) — enables "Add to Home Screen" as a
 * standalone app on the dark canvas. Next auto-injects the <link rel="manifest">
 * from this file convention; the iOS home-screen icon comes from the
 * apple-touch-icon (layout.tsx metadata), since Safari prefers it over these.
 *
 * The icons are PLACEHOLDERS (a lime spark on #0B0B0D) produced by
 * scripts/generate-icons.mjs — same file bleeds to the edges so it doubles as
 * the maskable icon. FOUNDER: drop a real logo into public/ (same filenames) or
 * re-run that script.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Baclog",
    short_name: "Baclog",
    description: "Tus obsesiones, en una tarjeta.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#0B0B0D",
    theme_color: "#0B0B0D",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

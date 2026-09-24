import type { MetadataRoute } from "next";

/**
 * PWA web app manifest (F3.7 followup) — enables "Add to Home Screen" as a
 * standalone app on the dark canvas. Next auto-injects the <link rel="manifest">
 * from this file convention; the iOS home-screen icon comes from the
 * apple-touch-icon (layout.tsx metadata), since Safari prefers it over these.
 *
 * The icons are the Kura mark (design/kura/sistema-de-diseno.dc.html §marca ·
 * ícono: a cut of a collection — 1:1 and 2:3 covers in four offset columns,
 * three filled in washi and one in honey), rasterized from
 * public/kura-icon.svg. Full-bleed on the #232329→#0f0f12 background, so the
 * same file serves as the maskable icon and iOS rounds it itself.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kura",
    short_name: "Kura",
    description: "Guarda lo que más vale: películas, series y música, en colecciones.",
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

import type { Metadata, Viewport } from "next";
import { LaberintoClient } from "./laberinto-client";
import "./laberinto.css";

/*
 * /party/laberinto — what's behind the gate (Claude Design 383601c9…,
 * "proto/Fase 3d - Laberinto cementerio.html"). The page is only a mount
 * point: the labyrinth itself is the design's own ES modules, served verbatim
 * from public/party/laberinto (see laberinto-client.tsx).
 */

/** Same nothing-given-away preview as the gate. */
const PREVIEW = { url: "/party/og-dark.jpg", width: 1200, height: 630, alt: "Algo te mira desde la oscuridad." };

export const metadata: Metadata = {
  title: "El laberinto",
  description: "Si te atreves.",
  robots: { index: false, follow: false },
  openGraph: { title: "El laberinto", description: "Si te atreves.", url: "/party/laberinto", images: [PREVIEW] },
  twitter: { card: "summary_large_image", title: "El laberinto", description: "Si te atreves.", images: [PREVIEW.url] },
};

export const viewport: Viewport = { themeColor: "#07080b" };

export default function LaberintoPage() {
  return (
    <>
      {/* The modules draw tombstone engravings on <canvas> with these families by NAME, so they need the
          real Google Fonts faces (next/font renames them) — same sheet as the design's page. */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Creepster&family=Oswald:wght@500;600&family=Cinzel:wght@400;700&display=swap"
      />
      <LaberintoClient />
    </>
  );
}

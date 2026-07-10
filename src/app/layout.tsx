import type { Metadata, Viewport } from "next";
import {
  Bricolage_Grotesque,
  Hanken_Grotesk,
  Instrument_Serif,
  Space_Mono,
} from "next/font/google";
import "./globals.css";

/* Design system fonts (sistema-diseno §3). next/font self-hosts each family
   and exposes a CSS variable that globals.css maps onto --font-* tokens. */
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-bricolage",
  display: "swap",
});
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
  display: "swap",
});
const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-hanken",
  display: "swap",
});
const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-space-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Baclog",
  description: "Tus obsesiones, en una tarjeta.",
  // iOS home-screen icon — Safari prefers apple-touch-icon over the manifest
  // icons. Placeholder spark (scripts/generate-icons.mjs); the app/favicon.ico
  // convention stays auto-linked for browser tabs. The PWA install icons
  // (192/512 + maskable) live in src/app/manifest.ts.
  icons: { apple: "/apple-touch-icon.png" },
  // Home-screen installs: without `black-translucent`, iOS reserves an opaque
  // status bar and the page canvas STARTS BELOW it — every top aura visibly
  // cuts off at the status-bar line. Translucent + viewportFit:"cover" lets
  // the auras bleed underneath while headers stay clear via their
  // env(safe-area-inset-top) paddings (already in place app-wide).
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Baclog",
  },
};

export const viewport: Viewport = {
  themeColor: "#0B0B0D",
  width: "device-width",
  initialScale: 1,
  // Let content extend into the safe areas so env(safe-area-inset-*) resolves
  // to real values — the floating dock/header math depends on it (default
  // "auto" leaves those insets at 0).
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`h-full antialiased ${bricolage.variable} ${instrumentSerif.variable} ${hanken.variable} ${spaceMono.variable}`}
    >
      <head>
        {/* Card renderers draw these families onto <canvas>, so they must load
            as real document fonts (next/font's hashed names are unusable
            there). Kept in sync with CARD_FONTS in src/modules/cards. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- app-router root layout loads fonts app-wide; rule targets pages/_document */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Instrument+Serif:ital@0;1&family=Hanken+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap"
        />
      </head>
      <body className="min-h-full flex flex-col bg-bg text-text">
        {children}
      </body>
    </html>
  );
}

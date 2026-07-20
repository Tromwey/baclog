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
        {/* This Next build's `appleWebApp: { capable: true }` only emits the
            generic `mobile-web-app-capable` tag (see its own docs), not
            `apple-mobile-web-app-capable`. Safari specifically needs the
            latter to launch the home-screen install in true standalone
            mode — without it, iOS falls back to a hybrid Safari chrome that
            (a) ignores `statusBarStyle: black-translucent` (opaque status
            bar) and (b) still collapses its toolbar on first touch,
            triggering iOS's 100dvh recalculation-on-first-scroll bug. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
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
        {/* Portrait-only lock (see globals.css .portrait-lock) — hidden except
            in short/phone-shaped landscape viewports, where it covers the
            card UI instead of letting it visibly break. */}
        <div className="portrait-lock">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden>
            <rect
              x="7"
              y="2"
              width="10"
              height="20"
              rx="2"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="M12 18.5h.01"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <p className="font-serif text-xl italic text-text">
            Gira tu dispositivo
          </p>
          <p className="max-w-[30ch] text-sm leading-[1.55] text-text-2">
            Baclog está diseñado para uso vertical.
          </p>
        </div>
      </body>
    </html>
  );
}

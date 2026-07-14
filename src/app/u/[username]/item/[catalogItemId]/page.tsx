import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Music, Play } from "lucide-react";
import {
  getPublicCatalogItem,
  getPublicProfile,
} from "@/modules/backlog/public";
import { captureView } from "@/modules/analytics/capture";
import { Button, MonoMeta } from "@/components/ui";
import { ItemHeroAura } from "@/components/item-hero-aura";
import { Tracklist } from "@/components/tracklist";
import { getItemDisplayMedia } from "@/modules/catalog/display-media";
import { getSpanishOverview } from "@/modules/catalog/tmdb";
import { auraSeed } from "@/lib/color";

// Dynamic on purpose (see u/[username]/page.tsx) — F3.4 viewer analytics.

/** Genre casing differs by source (TMDB "Drama", iTunes lowercased) — normalize
 * the first letter for the meta line. */
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string; catalogItemId: string }>;
}): Promise<Metadata> {
  const { catalogItemId } = await params;
  const item = await getPublicCatalogItem(catalogItemId);
  if (!item) return {};
  // Spanish SEO description when available (cache-shared with the page body's
  // call), English stored synopsis otherwise.
  const esOverview =
    item.source === "tmdb" && item.mediaType !== "album"
      ? await getSpanishOverview(item.externalId, item.mediaType)
      : null;
  return {
    title: `${item.title} · Baclog`,
    description: (esOverview ?? item.synopsis) ?? `${item.title} en Baclog`,
    openGraph: {
      title: item.title,
      description: [item.byline, item.year].filter(Boolean).join(" · "),
      ...(item.posterUrl ? { images: [item.posterUrl] } : {}),
    },
  };
}

/**
 * F2.19 — the anonymous-viewer conversion page: real artwork (in-page
 * display + link-out = the safe zone per ADR-008), buttons to every
 * service, and the register CTA.
 */
export default async function PublicItemPage({
  params,
}: {
  params: Promise<{ username: string; catalogItemId: string }>;
}) {
  const { username, catalogItemId } = await params;
  const [profile, item] = await Promise.all([
    getPublicProfile(username),
    getPublicCatalogItem(catalogItemId),
  ]);
  if (!profile || !item) notFound();

  // Album tracklist OR film/series Spanish synopsis (English fallback), derived
  // from the source provider and cached — shared with the in-app item page.
  const { tracks, synopsis } = await getItemDisplayMedia(item);

  captureView({
    eventType: "public_item_view",
    targetUsername: username,
    headers: await headers(),
  });

  const resolve = (extra: string) =>
    `/api/links/resolve?catalogItemId=${item.id}${extra}`;

  return (
    <div className="relative mx-auto min-h-dvh w-full max-w-md overflow-hidden bg-bg text-text">
      {/* Content-driven ADN aura from the shared cover palette — same hero the
          in-app /item page uses (paletteHex is cover-derived + public-safe, and
          extracts on-device when it hasn't been backfilled yet). Deliberately
          NO catalogItemId: this page is anonymous, so it stays display-only —
          the shared row is filled by signed-in views + the admin backfill, not
          by an unauthenticated write from this viral surface. */}
      <ItemHeroAura
        paletteHex={item.paletteHex}
        posterUrl={item.posterUrl}
        seed={auraSeed(item.id)}
      />

      <main className="relative px-5 pb-32 pt-8">
        <Link
          href={`/u/${username}`}
          className="inline-flex items-center gap-1 font-mono text-xs uppercase tracking-[0.08em] text-text-2 transition-colors hover:text-text"
        >
          <ChevronLeft size={14} /> @{profile.username}
        </Link>

        <div className="bl-rise mt-5 flex gap-4">
          {item.posterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- hotlinked external CDN (ADR-007)
            <img
              src={item.posterUrl}
              alt={`Portada de ${item.title}`}
              className="h-44 w-30 shrink-0 rounded-[var(--r-md)] object-cover shadow-[var(--shadow-card)]"
            />
          ) : (
            <div className="flex h-44 w-30 shrink-0 items-center justify-center rounded-[var(--r-md)] bg-surface-2 text-text-3">
              {item.mediaType === "album" ? (
                <Music size={30} />
              ) : (
                <Play size={30} />
              )}
            </div>
          )}
          <div className="min-w-0 pt-1">
            <h1 className="font-serif text-2xl italic leading-tight text-text">
              {item.title}
            </h1>
            <MonoMeta className="mt-2 block normal-case tracking-normal text-text-2">
              {[item.byline, item.year, item.genre && cap(item.genre)]
                .filter(Boolean)
                .join(" · ")}
            </MonoMeta>
          </div>
        </div>

        {/* Films/series carry a TMDB synopsis; albums show their tracklist
            below instead (iTunes has no album description — see M4/M5 note on
            editorialNotes). Shown in-app under identification use + attribution,
            never on an export card (ADR-008). */}
        {synopsis && (
          <p className="bl-rise mt-5 text-sm leading-[1.55] text-text-2">
            {synopsis}
          </p>
        )}

        <div className="mt-7 space-y-2.5">
          {item.mediaType === "album" ? (
            <>
              <a
                href={resolve("&service=spotify")}
                className="block w-full rounded-full bg-[#1db954] py-3.5 text-center font-sans font-semibold text-black transition-transform active:scale-[0.97]"
              >
                Escuchar en Spotify
              </a>
              <a
                href={resolve("&service=apple_music")}
                className="block w-full rounded-full bg-[#fa2d48] py-3.5 text-center font-sans font-semibold text-white transition-transform active:scale-[0.97]"
              >
                Escuchar en Apple Music
              </a>
              <a
                href={resolve("&service=youtube_music")}
                className="block w-full rounded-full bg-[#ff0000] py-3.5 text-center font-sans font-semibold text-white transition-transform active:scale-[0.97]"
              >
                Escuchar en YouTube Music
              </a>
            </>
          ) : (
            <Button href={resolve("")} className="w-full">
              Ver dónde streamear
            </Button>
          )}
        </div>

        <Tracklist tracks={tracks} />

        <p className="mt-8 text-center">
          <MonoMeta className="text-[10px] text-text-3">
            {item.mediaType === "album"
              ? "Datos y portadas de Apple Music"
              : "Datos e imágenes de TMDB · Disponibilidad por JustWatch"}
          </MonoMeta>
        </p>
      </main>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md px-5 pb-5">
        <Button
          href="/login"
          className="pointer-events-auto w-full shadow-[0_0_30px_var(--accent-soft)]"
        >
          Crea tu Baclog →
        </Button>
      </div>
    </div>
  );
}

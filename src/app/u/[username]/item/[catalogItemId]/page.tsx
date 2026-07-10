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
import { AuraField, Button, MonoMeta, PUBLIC_ITEM_AURA } from "@/components/ui";

// Dynamic on purpose (see u/[username]/page.tsx) — F3.4 viewer analytics.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string; catalogItemId: string }>;
}): Promise<Metadata> {
  const { catalogItemId } = await params;
  const item = await getPublicCatalogItem(catalogItemId);
  if (!item) return {};
  return {
    title: `${item.title} · Baclog`,
    description: item.synopsis ?? `${item.title} en Baclog`,
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

  captureView({
    eventType: "public_item_view",
    targetUsername: username,
    headers: await headers(),
  });

  const resolve = (extra: string) =>
    `/api/links/resolve?catalogItemId=${item.id}${extra}`;

  return (
    <div className="relative mx-auto min-h-dvh w-full max-w-md overflow-hidden bg-bg text-text">
      {/* Shared catalog page — no user palette to aura from, so the fixed
          signature gradient (PUBLIC_ITEM_AURA) via the unified primitive. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[260px]"
      >
        <AuraField layers={[PUBLIC_ITEM_AURA]} />
      </div>

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
              {[item.byline, item.year].filter(Boolean).join(" · ")}
            </MonoMeta>
          </div>
        </div>

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

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getPublicCatalogItem,
  getPublicProfile,
} from "@/modules/backlog/public";

export const revalidate = 300;

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

  const resolve = (extra: string) =>
    `/api/links/resolve?catalogItemId=${item.id}${extra}`;

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md bg-neutral-950 px-4 pb-20 pt-8 text-neutral-100">
      <Link
        href={`/u/${username}`}
        className="text-sm text-neutral-400 hover:text-neutral-200"
      >
        ← @{profile.username}
      </Link>

      <div className="mt-4 flex gap-4">
        {item.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- hotlinked external CDN (ADR-007)
          <img
            src={item.posterUrl}
            alt={`Portada de ${item.title}`}
            className="h-44 w-30 shrink-0 rounded-xl object-cover shadow-lg"
          />
        ) : (
          <div className="flex h-44 w-30 shrink-0 items-center justify-center rounded-xl bg-neutral-800 text-3xl">
            {item.mediaType === "album" ? "♫" : "▶"}
          </div>
        )}
        <div className="min-w-0 pt-1">
          <h1 className="text-xl font-bold leading-tight">{item.title}</h1>
          <p className="mt-1 text-sm text-neutral-400">
            {[item.byline, item.year].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>

      <div className="mt-6 space-y-2">
        {item.mediaType === "album" ? (
          <>
            <a
              href={resolve("&service=spotify")}
              className="block w-full rounded-full bg-[#1db954] py-3 text-center font-semibold text-black"
            >
              Escuchar en Spotify
            </a>
            <a
              href={resolve("&service=apple_music")}
              className="block w-full rounded-full bg-[#fa2d48] py-3 text-center font-semibold text-white"
            >
              Escuchar en Apple Music
            </a>
            <a
              href={resolve("&service=youtube_music")}
              className="block w-full rounded-full bg-[#ff0000] py-3 text-center font-semibold text-white"
            >
              Escuchar en YouTube Music
            </a>
          </>
        ) : (
          <a
            href={resolve("")}
            className="block w-full rounded-full bg-neutral-100 py-3 text-center font-semibold text-neutral-900"
          >
            Ver dónde streamear
          </a>
        )}
      </div>

      <footer className="mt-12 text-center">
        <Link
          href="/login"
          className="inline-block rounded-full border border-neutral-600 px-6 py-3 font-semibold"
        >
          Crea tu Baclog
        </Link>
        <p className="mt-6 text-[11px] text-neutral-600">
          {item.mediaType === "album"
            ? "Datos y portadas de Apple Music"
            : "Datos e imágenes de TMDB · Disponibilidad por JustWatch"}
        </p>
      </footer>
    </main>
  );
}

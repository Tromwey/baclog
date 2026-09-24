import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/auth";
import {
  getPublicCatalogItem,
  getPublicProfile,
} from "@/modules/backlog/public";
import { getTitleStats } from "@/modules/backlog/title-stats";
import { captureView } from "@/modules/analytics/capture";
import { Synopsis } from "@/components/synopsis";
import { getItemDisplayMedia } from "@/modules/catalog/display-media";
import { getRenderInstant, isUpcoming, restArrivesLabel } from "@/modules/catalog/release";
import { seriesStatusLabel } from "@/modules/catalog/series-status";
import { getSpanishOverview } from "@/modules/catalog/tmdb";
import type { MediaType } from "@/modules/catalog/types";
import {
  countPublicReviews,
  getPublicOwnerReview,
  getReviewFeedPage,
} from "@/modules/reviews/queries";
import { ShareChip } from "@/app/u/share-chip";
import {
  BrandLockup,
  CountRibbon,
  Cover,
  CreditsLink,
  CtaCard,
  EnterPill,
  Glyph,
  Mono,
  SectionTitle,
  formatMil,
} from "@/components/kura/components";
import { releaseSentence, tintSurfaceVertical } from "@/components/kura/tint";
import { PublicReviews } from "./public-reviews";

// Dynamic on purpose (see u/[username]/page.tsx) — F3.4 viewer analytics.

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
    title: `${item.title} · kura`,
    description: (esOverview ?? item.synopsis) ?? `${item.title} en kura`,
    openGraph: {
      title: item.title,
      description: [item.byline, item.year].filter(Boolean).join(" · "),
      ...(item.posterUrl ? { images: [item.posterUrl] } : {}),
    },
  };
}

/** The mock's kind label in the meta line: "Cine · 2001 · 125 min". */
const KIND: Record<MediaType, string> = {
  film: "Cine",
  series: "Serie",
  album: "Álbum",
};

/** The "escuchar en" rows (24c: "Abrir en …"), in the mock's order. */
const MUSIC_SERVICES = [
  { id: "apple_music", label: "Apple Music", mark: "am" },
  { id: "spotify", label: "Spotify", mark: "sp" },
  { id: "youtube_music", label: "YouTube Music", mark: "yt" },
  { id: "tidal", label: "TIDAL", mark: "td" },
] as const;

/**
 * Kura · 29a ficha pública (design/kura/flujos-v2.dc.html, flujo 12): the
 * header tinted by the title's own palette (180°, fused into the page), the
 * brand lockup and the way in at 64/24, the cover centred (200×300 · album
 * 240×240), the title in Newsreader italic 30, the byline, the mono data
 * line, the ribbon of counts, then the SOLID Guardar beside Compartir; below,
 * the sections in Newsreader 24: dónde ver / escuchar en, the synopsis or the
 * songs, "en kura" as glass pills, reseñas, and the CTA card. Guardar leads
 * a visitor into the account flow (O1a: "Para guardar X en una colección.
 * crea tu cuenta.").
 */
export default async function PublicItemPage({
  params,
}: {
  params: Promise<{ username: string; catalogItemId: string }>;
}) {
  const { username, catalogItemId } = await params;

  // Founder call (2026-08-28): a SIGNED-IN viewer opening a shared item link
  // gets their OWN item page — the app knows their preferred service, their
  // collections and their reactions, so the generic conversion splash is
  // strictly worse for them. This page stays the anonymous visitor's landing.
  //
  // The redirect runs BEFORE any owner lookup and unconditionally on session,
  // so it confirms nothing about the username (private, nonexistent and
  // public all redirect identically — no enumeration oracle); /item/[id]
  // itself is session-gated and 404s unknown catalog ids.
  const viewer = await getCurrentUser();
  if (viewer) redirect(`/item/${catalogItemId}`);

  const [profile, item, ownerReview, feed, reviewCount, stats] =
    await Promise.all([
      getPublicProfile(username),
      getPublicCatalogItem(catalogItemId),
      // F3.9 — the reason they were sent this link, pinned first in the list.
      getPublicOwnerReview(username, catalogItemId),
      getReviewFeedPage(catalogItemId, { excludeUsername: username }),
      countPublicReviews(catalogItemId),
      getTitleStats(catalogItemId),
    ]);
  if (!profile || !item) notFound();

  // Album tracklist OR film/series Spanish synopsis (English fallback), derived
  // from the source provider and cached — shared with the in-app item page.
  // F3.8 note: unlike the palette, this DOES write back on the anonymous page
  // (getItemDisplayMedia persists the release date). The palette rule exists
  // because that value is extracted on the VIEWER's device — user-supplied. A
  // release date comes from iTunes server-side, so an anonymous visitor can
  // trigger the refresh but can never influence what gets stored.
  const { tracks, trackCount, synopsis, releaseDate, seriesStatus } =
    await getItemDisplayMedia(item);

  const now = await getRenderInstant();
  const upcoming = isUpcoming(releaseDate, now);

  captureView({
    eventType: "public_item_view",
    targetUsername: username,
    headers: await headers(),
  });

  const resolve = (extra: string) =>
    `/api/links/resolve?catalogItemId=${item.id}${extra}`;

  const isAlbum = item.mediaType === "album";
  const palette = item.paletteHex ?? [];
  const minutes = Math.round(
    tracks.reduce((ms, t) => ms + (t.durationMs ?? 0), 0) / 60_000,
  );
  const meta = [
    KIND[item.mediaType],
    upcoming ? null : item.year,
    isAlbum && trackCount ? `${trackCount} ${trackCount === 1 ? "canción" : "canciones"}` : null,
    !isAlbum && seriesStatus ? seriesStatusLabel(seriesStatus) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="kura relative mx-auto min-h-dvh w-full max-w-md overflow-x-clip bg-bg pb-14 text-text">
      <header
        className="relative flex flex-col items-center gap-3 px-6 pb-[30px] pt-[calc(124px+env(safe-area-inset-top))]"
        style={{ background: tintSurfaceVertical(palette) }}
      >
        <div className="absolute inset-x-6 top-[calc(64px+env(safe-area-inset-top))] flex items-center justify-between">
          <BrandLockup />
          <EnterPill />
        </div>

        <Cover
          posterUrl={item.posterUrl}
          paletteHex={palette}
          mediaType={item.mediaType}
          alt={`Portada de ${item.title}`}
          className={isAlbum ? "h-[240px] w-[240px]" : "h-[300px] w-[200px]"}
        />
        <h1 className="mt-2 text-center font-brand text-[30px] italic leading-[1.05] text-text text-balance [overflow-wrap:anywhere]">
          {item.title}
        </h1>
        {item.byline && <p className="text-center text-[15px] text-text-2">{item.byline}</p>}
        {meta && <Mono>{meta}</Mono>}
        {upcoming && releaseDate && (
          <span className="inline-flex items-center gap-[7px] font-mono text-[11px] uppercase tracking-[0.08em] text-st-waiting">
            <Glyph kind="waiting" size={13} />
            {releaseSentence(releaseDate, now)}
          </span>
        )}
        {/* "En kura": how many people the title obsesses / completed, across
            everyone (title-stats.ts — a count, never an identity). */}
        <CountRibbon
          className="mt-0.5"
          counts={[
            { kind: "obsessed", n: stats.obsessed, label: "obsesionados" },
            { kind: "completed", n: stats.completed, label: "completos" },
          ]}
        />
        <div className="mt-2 flex items-center gap-2">
          <Link
            href="/login"
            className="inline-flex h-12 items-center gap-2 rounded-full bg-text pl-[18px] pr-[22px] font-sans text-[16px] font-semibold text-bg bl-press"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M7 2.6h10a2.2 2.2 0 012.2 2.2v16.6L12 17.6l-7.2 3.8V4.8A2.2 2.2 0 017 2.6z" />
            </svg>
            Guardar
          </Link>
          <ShareChip path={`/u/${username}/item/${item.id}`} label={`Compartir ${item.title}`} className="h-12! w-12!" />
        </div>
      </header>

      <main className="relative flex flex-col gap-[30px] px-6 pt-1">
        {isAlbum ? (
          <>
            <section className="flex flex-col gap-1">
              <SectionTitle>escuchar en</SectionTitle>
              {MUSIC_SERVICES.map((s) => (
                <a
                  key={s.id}
                  href={resolve(`&service=${s.id}`)}
                  className="flex min-h-[56px] items-center gap-3.5 transition-opacity active:opacity-70"
                >
                  <span aria-hidden className="flex h-10 w-10 flex-none items-center justify-center rounded-[10px] bg-surface-2 font-mono text-[12px] font-medium text-text">
                    {s.mark}
                  </span>
                  <span className="flex-1 text-[16px] font-medium text-text">{s.label}</span>
                  <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">Abrir</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-2" aria-hidden>
                    <path d="M7 17L17 7M9 7h8v8" />
                  </svg>
                </a>
              ))}
            </section>
            {tracks.length > 0 && (
              <section className="flex flex-col gap-1">
                <SectionTitle aside={minutes > 0 ? `${minutes} min` : undefined}>canciones</SectionTitle>
                {tracks.map((t) => (
                  <div key={t.n} className="flex min-h-12 items-center gap-3.5">
                    <span className="w-[22px] flex-none font-mono text-[12px] text-text-2">{String(t.n).padStart(2, "0")}</span>
                    <span className="min-w-0 flex-1 truncate text-[15px] text-text">{t.name}</span>
                  </div>
                ))}
                {upcoming && releaseDate && trackCount > tracks.length && (
                  <p className="pt-2 font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">
                    {tracks.length} de {trackCount} disponibles · el resto llega {restArrivesLabel(releaseDate, now)}
                  </p>
                )}
              </section>
            )}
          </>
        ) : (
          <section className="flex flex-col gap-1">
            <SectionTitle>dónde ver</SectionTitle>
            {/* TMDB's guidance for watch/providers data is "a reference on
                each media item": the row carries the JustWatch attribution. */}
            <a href={resolve("")} className="flex min-h-[56px] items-center gap-3.5 transition-opacity active:opacity-70">
              <span aria-hidden className="flex h-10 w-10 flex-none items-center justify-center rounded-[10px] bg-surface-2 font-mono text-[12px] font-medium text-text">
                jw
              </span>
              <span className="flex-1 text-[16px] font-medium text-text">JustWatch</span>
              <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">Ver dónde</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-2" aria-hidden>
                <path d="M7 17L17 7M9 7h8v8" />
              </svg>
            </a>
          </section>
        )}

        {/* Films/series carry a TMDB synopsis; albums have none (iTunes has no
            album description). Identification use + attribution (ADR-008). */}
        {synopsis && (
          <Synopsis text={synopsis} className="text-[15px] leading-[1.55] text-pretty text-text" />
        )}

        {/* "en kura" — how many people the title obsesses / completed, across
            everyone (title-stats.ts: a count, never an identity). */}
        {(stats.obsessed > 0 || stats.completed > 0) && (
          <section className="flex flex-col gap-3">
            <SectionTitle>en kura</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {stats.obsessed > 0 && (
                <span aria-label={`${stats.obsessed} les obsesiona`} className="inline-flex items-center gap-[7px] rounded-full bg-[var(--glass-bg)] px-3.5 py-[9px] font-mono text-[13px] leading-none text-text">
                  <Glyph kind="obsessed" size={13} />
                  {formatMil(stats.obsessed)}
                </span>
              )}
              {stats.completed > 0 && (
                <span aria-label={`${stats.completed} la completaron`} className="inline-flex items-center gap-[7px] rounded-full bg-[var(--glass-bg)] px-3.5 py-[9px] font-mono text-[13px] leading-none text-text">
                  <Glyph kind="completed" size={13} />
                  {formatMil(stats.completed)}
                </span>
              )}
            </div>
          </section>
        )}

        <PublicReviews
          catalogItemId={item.id}
          count={reviewCount}
          pinned={ownerReview}
          initialReviews={feed.reviews}
          initialCursor={feed.nextCursor}
          excludeUsername={username}
        />

        <CtaCard />

        {/* General TMDB/Apple Music attribution lives at /creditos (TMDB's
            FAQ allows centralizing it in an About/Credits section). */}
        <CreditsLink />
      </main>
    </div>
  );
}

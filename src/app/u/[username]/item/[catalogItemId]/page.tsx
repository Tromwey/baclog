import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/auth";
import {
  getPublicCatalogItem,
  getPublicProfile,
} from "@/modules/backlog/public";
import {
  getTitleStats,
  titleStatsSentence,
} from "@/modules/backlog/title-stats";
import { captureView } from "@/modules/analytics/capture";
import { FillIcon, PaletteGlow, StrokeIcon } from "@/components/ui";
import { EXTERNAL_PATH, PLAY_PATH } from "@/components/glyph-paths";
import { coverAspect } from "@/components/cover-tile";
import { Synopsis } from "@/components/synopsis";
import { Tracklist } from "@/components/tracklist";
import { getItemDisplayMedia } from "@/modules/catalog/display-media";
import {
  getRenderInstant,
  isUpcoming,
  restArrivesLabel,
} from "@/modules/catalog/release";
import { CountdownMono } from "@/components/countdown";
import { getSpanishOverview } from "@/modules/catalog/tmdb";
import type { MediaType } from "@/modules/catalog/types";
import { joinMeta } from "@/lib/format";
import {
  countPublicReviews,
  getPublicOwnerReview,
  getReviewFeedPage,
} from "@/modules/reviews/queries";
import { ShareChip } from "@/app/u/share-chip";
import { PublicReviews } from "./public-reviews";
import { TracklistCard } from "./tracklist-card";

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
    title: `${item.title} · Baclog`,
    description: (esOverview ?? item.synopsis) ?? `${item.title} en Baclog`,
    openGraph: {
      title: item.title,
      description: [item.byline, item.year].filter(Boolean).join(" · "),
      ...(item.posterUrl ? { images: [item.posterUrl] } : {}),
    },
  };
}

/** The mock's kind label in the meta line: "Cine · 2023 · Wim Wenders". */
const KIND: Record<MediaType, string> = {
  film: "Cine",
  series: "Serie",
  album: "Álbum",
};

/** The four "Dónde escuchar" rows, in the mock's order. */
const MUSIC_SERVICES = [
  { id: "spotify", label: "Spotify" },
  { id: "apple_music", label: "Apple Music" },
  { id: "youtube_music", label: "YouTube Music" },
  { id: "tidal", label: "TIDAL" },
] as const;

/** Surface tones that pad a short palette to the mock's five bands. */
const BAND_PAD = ["#26262c", "#1c1c21", "#141417"];

const GLASS_BUTTON =
  "flex flex-1 items-center justify-center gap-2 rounded-full bg-[var(--glass-bg)] px-4 py-[13px] font-sans text-[14px] font-semibold text-text transition-colors hover:bg-white/[0.12]";

/**
 * Screens 06b/06d/06f (Revamp UI, 2026-09-03) — the anonymous-viewer landing
 * for a shared title: wordmark + share, the cover beside the serif title over
 * the title's own glow, where to watch/listen, the synopsis, "En Baclog" and
 * the reviews, with the register CTA fixed over a fade at the bottom.
 */
export default async function PublicItemPage({
  params,
}: {
  params: Promise<{ username: string; catalogItemId: string }>;
}) {
  const { username, catalogItemId } = await params;

  // Founder call (2026-08-28): a SIGNED-IN viewer opening a shared item link
  // gets their OWN item page — the app knows their preferred service, their
  // backlogs and their reactions, so the generic every-service conversion
  // splash is strictly worse for them. This page stays what F2.19 built it to
  // be: the anonymous visitor's landing.
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
  const { tracks, trackCount, synopsis, releaseDate } =
    await getItemDisplayMedia(item);

  const now = await getRenderInstant();
  const upcoming = isUpcoming(releaseDate, now);
  const releaseIso = releaseDate ? releaseDate.toISOString() : null;

  captureView({
    eventType: "public_item_view",
    targetUsername: username,
    headers: await headers(),
  });

  const resolve = (extra: string) =>
    `/api/links/resolve?catalogItemId=${item.id}${extra}`;

  const isAlbum = item.mediaType === "album";
  const palette = item.paletteHex ?? [];
  // The mock's five palette bands for a title with no art: its hexes, then
  // surface tones so the cover always reads as a full card.
  const bands = [...palette, ...BAND_PAD].slice(0, 5);
  const minutes = Math.round(
    tracks.reduce((ms, t) => ms + (t.durationMs ?? 0), 0) / 60_000,
  );
  const inBaclog = titleStatsSentence(stats, item.mediaType);

  // Kind · year · byline. While an album is still coming, the countdown takes
  // the YEAR's slot (F3.8) — the date is catalog data, identical for anyone.
  const meta = joinMeta([
    KIND[item.mediaType],
    upcoming && releaseIso ? (
      <CountdownMono
        key="countdown"
        releaseDate={releaseIso}
        initialNow={now}
        className="text-[11px] tracking-[0.12em] text-text"
        liveClassName="text-[13px] tracking-[0.02em]"
      />
    ) : (
      item.year
    ),
    item.byline,
  ]);

  return (
    <div className="relative mx-auto min-h-dvh w-full max-w-md overflow-x-clip bg-bg pb-[150px] text-text">
      {/* Hero: the title's own two hexes as the page glow (the mock's
          `glow()`: 120°, .5, blur 90) hanging off the top edge. */}
      <div className="relative flex flex-col gap-[22px] px-6 pt-[calc(12px+env(safe-area-inset-top))]">
        <PaletteGlow
          hexes={palette.slice(0, 2)}
          angle={120}
          opacity={0.5}
          blur={90}
          className="-inset-x-[60px] -top-[120px] h-[460px]"
        />
        <div className="relative flex items-center justify-between">
          <Link
            href="/"
            className="font-display text-[18px] font-extrabold tracking-[-0.02em] text-text"
          >
            baclog
          </Link>
          <ShareChip
            path={`/u/${username}/item/${item.id}`}
            label={`Compartir ${item.title}`}
          />
        </div>

        <div className="relative flex items-end gap-4">
          <span
            className={`relative block w-[118px] flex-none overflow-hidden rounded-[14px] bg-surface-1 shadow-[0_20px_44px_-14px_rgba(0,0,0,.8)] ${coverAspect(item.mediaType)}`}
          >
            {item.posterUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- hotlinked external CDN (ADR-007)
              <img
                src={item.posterUrl}
                alt={`Portada de ${item.title}`}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <span aria-hidden className="absolute inset-0 flex flex-col">
                {bands.map((hex, i) => (
                  <span key={i} className="flex-1" style={{ background: hex }} />
                ))}
              </span>
            )}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-[14px] shadow-[inset_0_1px_0_rgba(255,255,255,.12)]"
            />
          </span>
          <span className="flex min-w-0 flex-col gap-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-2">
              {meta}
            </span>
            <h1 className="font-serif text-[40px] italic leading-[0.95] tracking-[-0.01em] text-pretty text-text [overflow-wrap:anywhere]">
              {item.title}
            </h1>
            {!item.posterUrl && (
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-3">
                Paleta extraída · sin arte
              </span>
            )}
          </span>
        </div>
      </div>

      <main className="relative flex flex-col gap-[22px] px-5 pt-[22px]">
        {isAlbum ? (
          <>
            {/* "Dónde escuchar": four glass rows, one per service, each to
                today's per-service resolve link. All four read "Abrir" — the
                mock's dimmed "No disponible" needs a pre-resolution this page
                doesn't do at render time. */}
            <div className="flex flex-col gap-2">
              <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-text-3">
                Dónde escuchar
              </span>
              {MUSIC_SERVICES.map((s) => (
                <a
                  key={s.id}
                  href={resolve(`&service=${s.id}`)}
                  className="flex items-center gap-3 rounded-full bg-[var(--glass-bg)] px-4 py-3 transition-colors hover:bg-white/[0.12]"
                >
                  <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full bg-white/10 text-text">
                    <FillIcon d={PLAY_PATH} size={12} />
                  </span>
                  <span className="flex-1 text-[14px] font-semibold text-text">
                    {s.label}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-3">
                    Abrir
                  </span>
                </a>
              ))}
            </div>
            {tracks.length > 0 && (
              <TracklistCard
                trackCount={upcoming ? trackCount : tracks.length}
                minutes={minutes}
              >
                <Tracklist
                  tracks={tracks}
                  totalCount={upcoming ? trackCount : undefined}
                  pendingLabel={
                    upcoming && releaseDate
                      ? restArrivesLabel(releaseDate, now)
                      : undefined
                  }
                />
              </TracklistCard>
            )}
          </>
        ) : (
          // TMDB's own guidance for watch/providers data is "a reference on
          // each media item" — the button's label carries the JustWatch
          // attribution instead of a separate note below it.
          <div className="flex gap-2.5">
            <a href={resolve("")} className={GLASS_BUTTON}>
              Dónde ver · JustWatch
              <StrokeIcon d={EXTERNAL_PATH} size={12} strokeWidth={2.4} />
            </a>
          </div>
        )}

        {/* Films/series carry a TMDB synopsis; albums have none (iTunes has no
            album description). Identification use + attribution (ADR-008). */}
        {synopsis && (
          <Synopsis
            text={synopsis}
            className="text-[15px] leading-[1.5] text-pretty text-text-2"
          />
        )}

        {/* "En Baclog" — the title's counts across the whole app (see
            title-stats.ts). Hidden until someone has reacted. */}
        {inBaclog && (
          <div className="flex flex-col gap-2.5">
            <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-text-3">
              En Baclog
            </span>
            <p className="font-serif text-[22px] italic leading-[1.1] text-pretty text-text">
              {inBaclog}
            </p>
          </div>
        )}

        <PublicReviews
          catalogItemId={item.id}
          count={reviewCount}
          pinned={ownerReview}
          initialReviews={feed.reviews}
          initialCursor={feed.nextCursor}
          excludeUsername={username}
        />

        {/* General TMDB/Apple Music attribution lives at /creditos (TMDB's
            FAQ allows centralizing it in an About/Credits section). */}
        <p className="text-center font-mono text-[10px] uppercase tracking-[0.1em] text-text-3">
          <Link href="/creditos" className="transition-colors hover:text-text-2">
            Créditos
          </Link>
        </p>
      </main>

      {/* The fade the CTA floats on, then the CTA itself: the one accent
          button on the page (no lima glow — §7) and its line. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 bottom-0 z-20 mx-auto h-[200px] w-full max-w-md"
        style={{ background: "linear-gradient(rgba(11,11,13,0), var(--bg) 55%)" }}
      />
      <div className="pointer-events-none fixed inset-x-0 bottom-[30px] z-30 mx-auto flex w-full max-w-md flex-col gap-2.5 px-5">
        <Link
          href="/login"
          className="pointer-events-auto rounded-full bg-accent py-[17px] text-center font-sans text-[16px] font-semibold text-bg transition-all active:scale-[0.98] active:bg-accent-press"
        >
          Empieza tu backlog →
        </Link>
        <span className="text-center text-[12px] text-text-3">
          Guarda, marca y comparte lo que te obsesiona
        </span>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/auth";
import { Music, Play } from "lucide-react";
import {
  getPublicCatalogItem,
  getPublicProfile,
} from "@/modules/backlog/public";
import { captureView } from "@/modules/analytics/capture";
import { BackButton, Button, MonoMeta } from "@/components/ui";
import { ItemHeroAura } from "@/components/item-hero-aura";
import { Synopsis } from "@/components/synopsis";
import { Tracklist } from "@/components/tracklist";
import { getItemDisplayMedia } from "@/modules/catalog/display-media";
import {
  getRenderInstant,
  isUpcoming,
  restArrivesLabel,
} from "@/modules/catalog/release";
import { CountdownHero, CountdownMono } from "@/components/countdown";
import { getSpanishOverview } from "@/modules/catalog/tmdb";
import { MEDIA_TYPE_TITLE } from "@/modules/catalog/types";
import { auraSeed, parseHex } from "@/lib/color";
import { capitalize, joinMeta } from "@/lib/format";
import {
  countPublicReviews,
  getPublicOwnerReview,
  getReviewFeedPage,
} from "@/modules/reviews/queries";
import {
  conversionLine,
  markLabel,
  supportsSpoiler,
} from "@/modules/reviews/format";
import { ReviewCard } from "@/components/reviews/review-card";
import { ReviewFeed } from "@/components/reviews/review-feed";

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

/**
 * F2.19 — the anonymous-viewer conversion page: real artwork (in-page
 * display + link-out = the safe zone per ADR-008), buttons to every
 * service, and the register CTA.
 */
export default async function PublicItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string; catalogItemId: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { username, catalogItemId } = await params;
  const { from } = await searchParams;

  // Founder call (2026-08-28): a SIGNED-IN viewer opening a shared item link
  // gets their OWN item page — the app knows their preferred service, their
  // backlogs and their reactions, so the generic every-service conversion
  // splash is strictly worse for them. This page stays what F2.19 built it to
  // be: the anonymous visitor's landing.
  //
  // The redirect runs BEFORE any owner lookup and unconditionally on session,
  // so it confirms nothing about the username (private, nonexistent and
  // public all redirect identically — no enumeration oracle); /item/[id]
  // itself is session-gated and 404s unknown catalog ids. Deliberate trade:
  // the owner auditing "what does my public page look like" loses item-level
  // preview while signed in (their profile/backlog previews still work).
  const viewer = await getCurrentUser();
  if (viewer) redirect(`/item/${catalogItemId}`);

  // ?from carries the origin backlog (set when navigating from a public backlog)
  // so back returns there, not to the profile. Validated to a bare id so it
  // can't inject into the href; absent/invalid (a shared item deep-link) → the
  // profile.
  const fromBacklogId = from && /^[0-9a-f-]{36}$/i.test(from) ? from : null;
  const [profile, item, ownerReview, feed, reviewCount] = await Promise.all([
    getPublicProfile(username),
    getPublicCatalogItem(catalogItemId),
    // F3.9 — the reason they were sent this link, and the conversation under it.
    getPublicOwnerReview(username, catalogItemId),
    getReviewFeedPage(catalogItemId, { excludeUsername: username }),
    countPublicReviews(catalogItemId),
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

  // Cover keeps the artwork's own aspect: albums are SQUARE, films/series 2:3
  // (this page used to force 2:3 on everything, so album art arrived letterboxed
  // into a poster slot). Bigger than the in-app /item hero on purpose — this is
  // the anonymous conversion surface, where the art does the selling.
  const coverSize =
    item.mediaType === "album"
      ? "h-[200px] w-[200px]"
      : "h-[240px] w-[160px]";

  // Palette-tinted cover shadow, same recipe as the in-app item page — here off
  // catalog_item.paletteHex (shared, cover-derived) since there's no user_item
  // for an anonymous viewer. Neutral black until it's been extracted.
  const shadowTint = item.paletteHex?.[0] ? parseHex(item.paletteHex[0]) : null;
  const coverShadow = `0 24px 60px ${
    shadowTint
      ? `rgba(${shadowTint.r},${shadowTint.g},${shadowTint.b},0.5)`
      : "rgba(0,0,0,0.5)"
  }`;

  // byline · year · genre. The media-type label is dropped for albums: the
  // square art, the artist byline and the "Escuchar en…" buttons already say
  // it. Película/Serie stays — that one carries information the page doesn't.
  // While the album is still coming, the countdown occupies the YEAR's slot
  // (identical to the in-app page, and identical for a visitor with no session
  // at all — the date is catalog data, never user data).
  //
  // Dropping the media-type label is also why this line is the one that can
  // START with the countdown: an album with no artist leaves everything before
  // it empty. joinMeta is what keeps that from printing "FALTAN 13 DÍASPop".
  const meta = joinMeta([
    item.mediaType !== "album" ? MEDIA_TYPE_TITLE[item.mediaType] : null,
    item.byline,
    upcoming && releaseIso ? (
      <CountdownMono
        key="countdown"
        releaseDate={releaseIso}
        initialNow={now}
        className="text-[10px] tracking-[0.1em] text-text"
        liveClassName="text-[13px] tracking-[0.02em]"
      />
    ) : (
      item.year
    ),
    item.genre && capitalize(item.genre),
  ]);

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

      {/* Top bar — same px-4 / pt-[24px+safe] as the backlog hero (BacklogHero)
          so the back chip sits in the SAME spot across screens (no jump when
          navigating backlog ⇄ item) and clears the notch when installed. */}
      <div className="relative flex px-4 pt-[calc(24px+env(safe-area-inset-top))]">
        <BackButton
          href={fromBacklogId ? `/u/${username}/${fromBacklogId}` : `/u/${username}`}
        />
      </div>

      <main className="relative px-5 pb-32 pt-5">
        <div className="bl-rise flex justify-center">
          {item.posterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- hotlinked external CDN (ADR-007)
            <img
              src={item.posterUrl}
              alt={`Portada de ${item.title}`}
              style={{ boxShadow: coverShadow }}
              className={`rounded-2xl object-cover ${coverSize}`}
            />
          ) : (
            <div
              className={`flex items-center justify-center rounded-2xl bg-surface-2 text-text-3 ${coverSize}`}
            >
              {item.mediaType === "album" ? (
                <Music size={40} />
              ) : (
                <Play size={40} />
              )}
            </div>
          )}
        </div>

        <div className="bl-rise mt-6 text-center">
          <h1 className="font-serif text-[38px] italic leading-[1.05] text-text">
            {item.title}
          </h1>
          <MonoMeta className="mt-2.5 block text-[10px] tracking-[0.1em] text-text-2">
            {meta}
          </MonoMeta>
          {releaseIso && upcoming && (
            <CountdownHero releaseDate={releaseIso} initialNow={now} />
          )}
        </div>

        {/* Films/series carry a TMDB synopsis; albums show their tracklist
            below instead (iTunes has no album description — see M4/M5 note on
            editorialNotes). Shown in-app under identification use + attribution,
            never on an export card (ADR-008). */}
        {synopsis && (
          <Synopsis
            text={synopsis}
            className="bl-rise mx-auto mt-4 max-w-[34ch] text-center text-sm leading-[1.55] text-text-2"
          />
        )}

        {/* F3.9 — whoever follows this link came for a PERSON. Their review
            goes before the service buttons: the page stops being
            "arte → acción" and becomes "arte → por qué te lo mandó → acción".
            Its own mono label keeps it from reading as part of the feed below. */}
        {ownerReview && (
          <div className="bl-rise mt-[26px]">
            <div className="mb-[10px] font-mono text-[9.5px] uppercase tracking-[0.12em] text-text-3">
              Lo que dice {profile.username}
            </div>
            <ReviewCard
              body={ownerReview.body}
              hasSpoiler={ownerReview.hasSpoiler}
              mark={ownerReview.mark}
              when={ownerReview.when}
              author={ownerReview.author}
              markLabel={markLabel(ownerReview.mark)}
              displayName={ownerReview.author.username}
            />
          </div>
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
              {/* TIDAL's brand is black-on-black; on our dark ground the pill
                  inverts to white so it reads as a peer of the other three. */}
              <a
                href={resolve("&service=tidal")}
                className="block w-full rounded-full bg-white py-3.5 text-center font-sans font-semibold text-black transition-transform active:scale-[0.97]"
              >
                Escuchar en TIDAL
              </a>
            </>
          ) : (
            // TMDB's own guidance for watch/providers data is "a reference on
            // each media item" (not necessarily a link) — the button's own
            // label carries the JustWatch attribution instead of a separate
            // note below it.
            <Button href={resolve("")} className="w-full">
              Ver en JustWatch
            </Button>
          )}
        </div>

        <Tracklist
          tracks={tracks}
          totalCount={upcoming ? trackCount : undefined}
          pendingLabel={
            upcoming && releaseDate
              ? restArrivesLabel(releaseDate, now)
              : undefined
          }
        />

        {/* The rest of the conversation. No ⋯ anywhere in here: an anonymous
            viewer can neither report nor edit, and a menu whose only entry is
            "regístrate" would be a trap (design decision). Spoilers ARE covered
            for them too — this is where it matters most, since nobody arrives
            here having seen the thing. */}
        {feed.reviews.length > 0 && (
          <section className="mt-7">
            <div className="mb-[18px] h-px bg-line" />
            <div className="mb-[14px] flex items-baseline justify-between gap-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-3">
                Reseñas
              </span>
              <span className="font-mono text-[10px] tracking-[0.06em] text-text-3">
                {reviewCount}
              </span>
            </div>
            <ReviewFeed
              catalogItemId={item.id}
              initialReviews={feed.reviews}
              initialCursor={feed.nextCursor}
              canReport={false}
              allowSpoiler={supportsSpoiler(item.mediaType)}
              excludeUsername={username}
            />
          </section>
        )}

        {/* The one conversion sentence on the page — everything else is done by
            the content itself. The fixed CTA below never changes. */}
        {conversionLine(reviewCount) && (
          <p className="mx-auto mt-[26px] max-w-[30ch] text-center text-[14.5px] leading-[1.5] text-text-2">
            {conversionLine(reviewCount)}
          </p>
        )}

        {/* General TMDB/Apple Music attribution lives at /creditos (TMDB's
            FAQ allows centralizing it in an About/Credits section). */}
        <p className="mt-8 text-center">
          <MonoMeta className="text-[10px] text-text-3">
            <Link href="/creditos" className="underline">
              Créditos
            </Link>
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

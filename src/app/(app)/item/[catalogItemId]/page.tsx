import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { capitalize, joinMeta } from "@/lib/format";
import {
  getBacklogNames,
  getUserCatalogEntry,
  getUserPalette,
} from "@/modules/backlog/queries";
import { getItemReviewContext } from "@/modules/reviews/queries";
import { legibleAdnPair, supportsSpoiler } from "@/modules/reviews/format";
import { getTitleActivityAmongFollowed } from "@/modules/social/title-activity";
import { ReviewsBlock } from "@/components/reviews/reviews-block";
import { getCatalogItem } from "@/modules/catalog/cache";
import { getItemDisplayMedia } from "@/modules/catalog/display-media";
import {
  getRenderInstant,
  isFreshlyReleased,
  isUpcoming,
  restArrivesLabel,
} from "@/modules/catalog/release";
import {
  CountdownBar,
  CountdownHero,
  CountdownMono,
} from "@/components/countdown";
import { AdnAvatar } from "@/components/adn-avatar";
import { posterFallbackStyle } from "@/components/cover-tile";
import { StateGlyph } from "@/components/ui/state-glyph";
import { FillIcon, StrokeIcon } from "@/components/ui/stroke-icon";
import { EXTERNAL_PATH, PLAY_PATH } from "@/components/glyph-paths";
import { SeriesStatusPill } from "@/components/series-status-pill";
import { ThemeColorSync } from "@/components/theme-color-sync";
import { Synopsis } from "@/components/synopsis";
import { BacklogsButton, BacklogsSheetHost } from "./add-to-backlog";
import { BackChip } from "./close-chip";
import { CompleteSheetHost } from "./complete-sheet";
import { glassButtonClass } from "./glass";
import { HideDock } from "./hide-dock";
import { ItemShareMenu } from "./item-share-menu";
import { KIND_LABEL, SERVICE_LABEL } from "./labels";
import { ItemReactionProvider } from "./reaction-state";
import { ReactionRow } from "./reaction-row";
import { RecoProvenance } from "./reco-reasoning-panel";
import { TracklistCard } from "./tracklist-card";

/**
 * Item detail · interna (Revamp UI 06a/06c/06e, 2026-09-03). A full-bleed
 * cover that fades into the page, the title in serif over it, and a body of
 * stacked rows: the reaction row (me gustó · obsesión · completo), the two
 * buttons (Dónde ver / Reproducir · En N backlogs), the album's tracklist
 * card, the synopsis, "Entre quienes sigues", and the reviews. No aura, no
 * fixed bar, no ⋯ menu, no dock (HideDock). Status and reaction are ONLY
 * editable here (HANDOFF §2), and completing goes through the Completar
 * sheet (08).
 */
export default async function ItemPage({
  params,
}: {
  params: Promise<{ catalogItemId: string }>;
}) {
  const user = await requireUser();
  const { catalogItemId } = await params;
  const [item, userBacklogs, entry, reviews, viewerPalette] = await Promise.all([
    getCatalogItem(catalogItemId),
    getBacklogNames(user.id),
    getUserCatalogEntry(user.id, catalogItemId),
    // F3.9 — own review + the first page of everyone else's, in one trip.
    getItemReviewContext(user.id, catalogItemId),
    getUserPalette(user.id, 2),
  ]);
  if (!item) notFound();

  // The viewer's own ADN, for the avatar on their own review card (same
  // legibility filter the feed's avatars use).
  const viewerHexes = legibleAdnPair(viewerPalette);

  // Album tracklist OR film/series Spanish synopsis (English fallback), derived
  // from the source provider and cached — shared with the public item page.
  // For an album this also refreshes catalog_item.release_date (F3.8), so read
  // the countdown off the returned value, not the row we loaded before it.
  const [{ tracks, trackCount, synopsis, releaseDate, seriesStatus }, friends] =
    await Promise.all([
      getItemDisplayMedia(item),
      getTitleActivityAmongFollowed(user.id, item.id, {
        limit: 4,
        mediaType: item.mediaType,
      }),
    ]);

  // F3.8 — ONE server instant, threaded to every countdown on the page so SSR
  // and the first client render agree. The wait is derived here and nowhere
  // else: no status, no flag.
  const now = await getRenderInstant();
  const upcoming = isUpcoming(releaseDate, now);
  const releaseIso = releaseDate ? releaseDate.toISOString() : null;
  const fresh = isFreshlyReleased(releaseDate, now);

  // AI provenance narrative — rides along on getUserCatalogEntry's LEFT JOIN
  // (rec* fields, null on non-AI entries) so it costs no extra round-trip.
  const narrative =
    entry &&
    entry.recHookEyebrow !== null &&
    entry.recHookTitle !== null &&
    entry.recResultEyebrow !== null &&
    entry.recSeedTitle !== null
      ? {
          hookEyebrow: entry.recHookEyebrow,
          hookTitle: entry.recHookTitle,
          resultEyebrow: entry.recResultEyebrow,
          closer: entry.recCloser,
          seedTitle: entry.recSeedTitle,
          // F3.5.8 honesty label: "thematic"/null = vibe fallback, anything
          // else names a verified graph edge (same rule as the /para-ti feed).
          linkKind: (entry.recLinkType && entry.recLinkType !== "thematic"
            ? "factual"
            : "thematic") as "factual" | "thematic",
        }
      : null;

  // The mock's meta line: "Cine · 2023 · Wim Wenders" — kind, year, byline,
  // with ONLY what the catalog stores (no runtime, no director: TMDB's search
  // payload doesn't carry them, and nothing here invents). The countdown
  // takes the year's slot while a title is upcoming (F3.8), and the genre
  // trails when present.
  const meta = joinMeta([
    KIND_LABEL[item.mediaType],
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
    item.genre && capitalize(item.genre),
  ]);

  const isAlbum = item.mediaType === "album";
  const palette = item.paletteHex ?? null;
  const linkHref = `/api/links/resolve?catalogItemId=${item.id}`;
  const service = user.preferredService ?? "spotify";
  const allowSpoiler = supportsSpoiler(item.mediaType);

  return (
    // key: a title added/removed during the visit is tracked by the provider
    // itself; the key only re-seeds when a NAVIGATION lands on another entry.
    <ItemReactionProvider
      key={entry?.id ?? "none"}
      catalogItemId={item.id}
      posterUrl={item.posterUrl}
      paletteHex={palette}
      backlogs={userBacklogs}
      initialMemberIds={entry ? entry.backlogs.map((b) => b.id) : []}
      initialVerdict={entry?.verdict ?? null}
      initialObsessed={entry?.obsessed ?? false}
      initialCompleted={entry?.status === "completed"}
      initialOwnReview={reviews.own}
    >
      <main className="relative mx-auto min-h-dvh w-full max-w-md pb-[60px] text-text">
        <HideDock />
        {/* Safari's status-bar band tints from theme-color — match the cover. */}
        <ThemeColorSync color={palette?.[0]} />

        {/* HERO — the cover full-bleed at its native aspect, lit from the
            top-right and fused into the page over its bottom half. */}
        <div
          className={`relative w-full overflow-hidden ${isAlbum ? "aspect-square" : "aspect-[3/4]"}`}
          style={item.posterUrl ? undefined : posterFallbackStyle(palette)}
        >
          {item.posterUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- hotlinked external CDN (ADR-007: never proxy)
            <img
              src={item.posterUrl}
              alt={`Portada de ${item.title}`}
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(120% 80% at 80% 0%, rgba(255,255,255,.18), transparent 60%), linear-gradient(transparent 50%, var(--bg))",
            }}
          />

          <div className="absolute left-5 right-5 top-[calc(12px+env(safe-area-inset-top))] flex justify-between">
            <BackChip />
            <ItemShareMenu
              itemId={item.id}
              title={item.title}
              publicUrl={
                user.username && user.isPublic
                  ? `https://baclog.app/${user.username}/item/${item.id}`
                  : null
              }
            />
          </div>

          <div className="absolute bottom-0 left-6 right-6 flex flex-col gap-2">
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-2">
              {meta}
            </p>
            <h1 className="font-serif text-[52px] italic leading-[0.95] tracking-[-0.01em] text-pretty">
              {item.title}
            </h1>
          </div>
        </div>

        {/* BODY */}
        <div className="flex flex-col gap-[22px] px-5 pt-[22px]">
          {/* F3.8 — the counter as display type, right under the title block:
              the one place the wait is the headline (design §1c). */}
          {releaseIso && (upcoming || fresh) && (
            <div className="-mt-2">
              <CountdownHero releaseDate={releaseIso} initialNow={now} />
            </div>
          )}

          <ReactionRow />

          {/* 06c — a series says whether it's over and how long it is (TMDB
              facts, cached on the row; null → nothing). */}
          <SeriesStatusPill status={seriesStatus} />

          {/* Buttons. Before release, "Dónde ver"/"Reproducir" would be a lie
              — the wait takes the slot (it informs, it doesn't ask), and the
              play slot survives only as the advance singles, if any. */}
          <div className="flex gap-2.5">
            {releaseIso && upcoming ? (
              <>
                <CountdownBar releaseDate={releaseIso} initialNow={now} />
                {tracks.length > 0 && (
                  <a
                    href={linkHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Escuchar los ${tracks.length} adelantos`}
                    className={`${glassButtonClass} flex-none`}
                  >
                    <FillIcon d={PLAY_PATH} size={12} />
                    {tracks.length}
                  </a>
                )}
              </>
            ) : isAlbum ? (
              <a
                href={linkHref}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-1 items-center justify-center gap-2 rounded-full bg-accent px-[18px] py-[13px] text-[14px] font-semibold text-bg transition-transform active:scale-[0.98]"
              >
                <FillIcon d={PLAY_PATH} size={12} />
                Reproducir en {SERVICE_LABEL[service]}
              </a>
            ) : (
              <a
                href={linkHref}
                target="_blank"
                rel="noopener noreferrer"
                className={`${glassButtonClass} flex-1`}
              >
                Dónde ver · JustWatch
                <StrokeIcon d={EXTERNAL_PATH} size={12} strokeWidth={2.4} />
              </a>
            )}
            <BacklogsButton />
          </div>

          {tracks.length > 0 && (
            <TracklistCard
              tracks={tracks}
              totalCount={upcoming ? trackCount : undefined}
              pendingLabel={
                upcoming && releaseDate ? restArrivesLabel(releaseDate, now) : undefined
              }
            />
          )}

          {synopsis && <Synopsis text={synopsis} />}

          {/* AI provenance: why this pairing + the user's own why-feedback.
              NO reco teaser here (founder decision 2026-07-09): recommendations
              live ONLY in Descubrir; this is provenance, not a reco. */}
          {entry && narrative && (
            <RecoProvenance
              narrative={narrative}
              sourceCrossMediaRecId={entry.sourceCrossMediaRecId}
            />
          )}

          {friends.total > 0 && (
            <section className="flex flex-col gap-2.5">
              <h2 className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-text-3">
                Entre quienes sigues · {friends.total}
              </h2>
              {friends.rows.map((f) => (
                <Link
                  key={f.username}
                  href={`/u/${f.username}`}
                  className="flex items-center gap-2.5"
                >
                  <AdnAvatar
                    hexes={f.avatarHexes}
                    initial={f.initial}
                    src={f.avatarUrl}
                    className="h-[26px] w-[26px] text-[11px]"
                  />
                  <span className="min-w-0 truncate text-[13.5px] text-text-2">
                    <b className="font-semibold text-text">@{f.username}</b> {f.what}
                  </span>
                  {f.state && (
                    <span className="ml-auto flex flex-none items-center">
                      <StateGlyph kind={f.state} />
                    </span>
                  )}
                </Link>
              ))}
            </section>
          )}

          {/* F3.9 — reseñas. Renders for an un-owned title too: reading the
              conversation is never gated, only writing is. */}
          <ReviewsBlock
            catalogItemId={item.id}
            itemTitle={item.title}
            allowSpoiler={allowSpoiler}
            viewerIsPublic={Boolean(user.username && user.isPublic)}
            viewerHexes={viewerHexes}
            viewerAvatarUrl={user.image}
            context={reviews}
          />
        </div>

        {/* Overlays — portaled to <body> by their components. */}
        <BacklogsSheetHost />
        <CompleteSheetHost
          item={{
            id: item.id,
            title: item.title,
            year: item.year,
            mediaType: item.mediaType,
            posterUrl: item.posterUrl,
            paletteHex: palette,
          }}
          allowSpoiler={allowSpoiler}
        />
      </main>
    </ItemReactionProvider>
  );
}

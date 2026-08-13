import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { auraSeed, parseHex } from "@/lib/color";
import { capitalize, joinMeta } from "@/lib/format";
import {
  getBacklogNames,
  getUserCatalogEntry,
  getUserPalette,
} from "@/modules/backlog/queries";
import { getItemReviewContext } from "@/modules/reviews/queries";
import { legibleAdnPair, supportsSpoiler } from "@/modules/reviews/format";
import { ReviewsBlock } from "@/components/reviews/reviews-block";
import { countLovedItems } from "@/modules/backlog/first-run";
import { getCatalogItem } from "@/modules/catalog/cache";
import { getItemDisplayMedia } from "@/modules/catalog/display-media";
import {
  getRenderInstant,
  isFreshlyReleased,
  isUpcoming,
  restArrivesLabel,
} from "@/modules/catalog/release";
import { MEDIA_TYPE_TITLE } from "@/modules/catalog/types";
import {
  CountdownBar,
  CountdownHero,
  CountdownMono,
} from "@/components/countdown";
import { AddToBacklog } from "./add-to-backlog";
import { CloseChip } from "./close-chip";
import { HideDock } from "./hide-dock";
import { ItemHeroAura } from "@/components/item-hero-aura";
import { Synopsis } from "@/components/synopsis";
import { Tracklist } from "@/components/tracklist";
import { ItemMoreMenu } from "./item-more-menu";
import { ItemShareMenu } from "./item-share-menu";
import { ObsessionGesture } from "./obsession-gesture";
import { ReactionCoach } from "./reaction-coach";
import { ProgressGesture } from "./progress-gesture";
import { ItemReactionProvider } from "./reaction-state";
import {
  RecoEyebrow,
  RecoFeedback,
  RecoReasoningPanel,
} from "./reco-reasoning-panel";

/**
 * Item detail (item-flow Phase 2) — zoom-pushed view, no dock (HANDOFF §6):
 * hero aura + poster + title block, the prominent "Me obsesiona" gesture, the
 * "¿Por qué?" narrative for AI-sourced entries, and a fixed bottom action bar
 * (Agregar · Reproducir · Progreso) the content scrolls behind. Status and
 * reaction are ONLY editable here (HANDOFF §2).
 */
export default async function ItemPage({
  params,
}: {
  params: Promise<{ catalogItemId: string }>;
}) {
  const user = await requireUser();
  const { catalogItemId } = await params;
  const [item, userBacklogs, entry, lovedCount, reviews, viewerPalette] =
    await Promise.all([
      getCatalogItem(catalogItemId),
      getBacklogNames(user.id),
      getUserCatalogEntry(user.id, catalogItemId),
      countLovedItems(user.id),
      // F3.9 — own review + the first page of everyone else's, in one trip.
      getItemReviewContext(user.id, catalogItemId),
      getUserPalette(user.id, 2),
    ]);
  if (!item) notFound();

  // The viewer's own ADN, for the avatar on their own review card (same
  // legibility filter the feed's avatars use — the initial is punched out in
  // the page background, so a near-black stop would erase it).
  const viewerHexes = legibleAdnPair(viewerPalette);

  // Album tracklist OR film/series Spanish synopsis (English fallback), derived
  // from the source provider and cached — shared with the public item page.
  // For an album this also refreshes catalog_item.release_date (F3.8), so read
  // the countdown off the returned value, not the row we loaded before it.
  const { tracks, trackCount, synopsis, releaseDate } =
    await getItemDisplayMedia(item);

  // F3.8 — ONE server instant, threaded to every countdown on the page so SSR
  // and the first client render agree (they'd disagree by whatever the request
  // took). The wait is derived here and nowhere else: no status, no flag.
  const now = await getRenderInstant();
  const upcoming = isUpcoming(releaseDate, now);
  const releaseIso = releaseDate ? releaseDate.toISOString() : null;
  const fresh = isFreshlyReleased(releaseDate, now);

  // AI provenance narrative — rides along on getUserCatalogEntry's LEFT JOIN
  // (rec* fields, null on non-AI entries) so it costs no extra round-trip.
  // recCloser stays nullable inside a present narrative; the rest are NOT NULL
  // on the rec row, so checking each is only for the type narrowing.
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

  // Mock #p3's meta line carries no stats (HANDOFF §0 — no ratings UI).
  // Genre capitalized to match the public item page (audit fix — catalog
  // genres are stored lowercased for both sources; capitalize() is display-only).
  // The countdown sits in the YEAR's slot, which is the whole F3.8 rule: the
  // counter is never its own component, it's a value in an existing position
  // (design §0). A pre-order has no year to show anyway.
  const meta = joinMeta([
    MEDIA_TYPE_TITLE[item.mediaType],
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

  // Palette-tinted cover shadow (mock #p3: 0 24px 60px rgba(140,40,60,.5) —
  // the dominant hue at half alpha). Neutral black until the item is logged
  // (or if the persisted hex is malformed).
  const shadowTint = entry?.paletteHex?.[0]
    ? parseHex(entry.paletteHex[0])
    : null;
  const coverShadow = `0 24px 60px ${
    shadowTint
      ? `rgba(${shadowTint.r},${shadowTint.g},${shadowTint.b},0.5)`
      : "rgba(0,0,0,0.5)"
  }`;

  // The aura is the only light in the system, so it's also the only thing that
  // registers the crossing: full-ish while the wait is on, dimmer for the day
  // after (design §1g), untouched for every ordinary title.
  let auraOpacity: number | undefined;
  if (fresh) auraOpacity = 0.55;
  else if (upcoming) auraOpacity = 0.82;

  return (
    // key: add-to-backlog's router.refresh() can swap `entry` (none → logged) —
    // remount the provider (and ProgressGesture below) so client state re-seeds
    // instead of pointing at a stale entry. State is per-title, so mutations key
    // on the catalog item, not the user_item id.
    <ItemReactionProvider
      key={entry?.id ?? "none"}
      catalogItemId={entry ? item.id : null}
      initialVerdict={entry?.verdict ?? null}
      initialObsessed={entry?.obsessed ?? false}
    >
      <main className="relative mx-auto min-h-dvh w-full max-w-md pb-44 text-text">
        <HideDock />
        {/* key: item/A → item/B navigations reuse this client tree — remount
            so A's on-device `extracted` palette (and its ThemeColorSync tint)
            can't bleed onto B while B extracts. */}
        <ItemHeroAura
          key={item.id}
          paletteHex={entry?.paletteHex ?? null}
          posterUrl={item.posterUrl}
          seed={auraSeed(item.id)}
          catalogItemId={item.id}
          opacity={auraOpacity}
        />

        {/* top bar: ✕ close + (share · ⋯). ⋯ mutates state so it needs a logged
            entry; ↗ does not — the public item page resolves off catalog_item
            alone, so "ya lo vi, no lo guardo, pero te lo paso" works without
            adding. Un-owned falls back to link-only (no backlog to stamp on a
            ticket) — see ItemShareMenu. */}
        <div className="relative z-20 flex items-center justify-between px-4 pt-[calc(16px+env(safe-area-inset-top))]">
          <CloseChip />
          <div className="flex items-center gap-2.5">
            <ItemShareMenu
              itemId={item.id}
              title={item.title}
              publicUrl={
                user.username && user.isPublic
                  ? `https://baclog.app/${user.username}/item/${item.id}`
                  : null
              }
              canShareCard={entry !== null}
            />
            {entry && (
              <ItemMoreMenu
                catalogItemId={item.id}
                sourceCrossMediaRecId={entry.sourceCrossMediaRecId}
              />
            )}
          </div>
        </div>

        {/* cover */}
        <div className="relative mt-7 flex justify-center">
          {item.posterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- hotlinked external CDN (ADR-007: never proxy)
            <img
              src={item.posterUrl}
              alt={`Portada de ${item.title}`}
              style={{ boxShadow: coverShadow }}
              className={`rounded-2xl object-cover ${
                item.mediaType === "album"
                  ? "h-[158px] w-[158px]"
                  : "h-[210px] w-[140px]"
              }`}
            />
          ) : (
            <div
              className={`flex items-center justify-center rounded-2xl bg-surface-2 text-3xl text-text-3 ${
                item.mediaType === "album"
                  ? "h-[158px] w-[158px]"
                  : "h-[210px] w-[140px]"
              }`}
            >
              {item.mediaType === "album" ? "♫" : "▶"}
            </div>
          )}
        </div>

        {/* title block */}
        <div className="relative px-5 pt-5 text-center">
          {narrative && <RecoEyebrow seedTitle={narrative.seedTitle} />}
          <h1
            className={`font-serif text-[44px] italic leading-[1.02] ${narrative ? "mt-3" : ""}`}
          >
            {item.title}
          </h1>
          <p className="mt-2.5 font-mono text-[10px] uppercase tracking-[0.1em] text-text-2">
            {meta}
          </p>
          {/* The counter as display type — the one place the wait is the
              headline instead of a footnote (design §1c). */}
          {releaseIso && (upcoming || fresh) && (
            <CountdownHero releaseDate={releaseIso} initialNow={now} />
          )}
          {synopsis && (
            <Synopsis
              text={synopsis}
              className="mx-auto mt-3.5 max-w-[34ch] text-sm leading-[1.5] text-text-2"
            />
          )}
        </div>

        {tracks.length > 0 && (
          <div className="relative px-5">
            <Tracklist
              tracks={tracks}
              totalCount={upcoming ? trackCount : undefined}
              pendingLabel={
                upcoming && releaseDate
                  ? restArrivesLabel(releaseDate, now)
                  : undefined
              }
            />
          </div>
        )}

        {/* the one prominent reaction (HANDOFF §2) */}
        {entry && (
          <div className="relative mt-6 px-5">
            <ObsessionGesture />
          </div>
        )}

        {/* Welcome onboarding step 3. A logged entry means backlogs > 0 and
            items > 0 by construction, so "nothing loved yet" IS step 3 — no
            other count needed.
            NOT gated on lovedCount here: reacting revalidates this page, so a
            server gate would unmount the component at the exact moment it has
            something to say. It freezes the flag itself and renders nothing
            when the step was already done. */}
        {entry && <ReactionCoach stepPending={lovedCount === 0} />}

        {/* F3.9 — reseñas: below the gesture that unlocks writing, above the
            provenance panel. Renders for an un-owned title too: reading the
            conversation is never gated, only writing is. */}
        <ReviewsBlock
          catalogItemId={item.id}
          itemTitle={item.title}
          allowSpoiler={supportsSpoiler(item.mediaType)}
          inLibrary={entry !== null}
          viewerIsPublic={Boolean(user.username && user.isPublic)}
          viewerHexes={viewerHexes}
          context={reviews}
        />

        {/* AI provenance: why this pairing + the user's own why-feedback */}
        {entry && narrative && (
          <div className="relative mt-3.5 space-y-3 px-5">
            <RecoReasoningPanel narrative={narrative} />
            <RecoFeedback
              catalogItemId={item.id}
              sourceCrossMediaRecId={entry.sourceCrossMediaRecId}
            />
          </div>
        )}

        {/* NO reco teaser here (founder decision 2026-07-09): announcing that a
            connection awaits spoils the surprise — recommendations live ONLY
            in Descubrir. The reasoning panel above is provenance, not a reco. */}

        {/* No Créditos link here — redundant for a signed-in user, who
            already has one in Ajustes (the app's About/Credits section per
            TMDB's own FAQ). Public pages keep their own link: anonymous
            viewers never reach Ajustes. */}

        {/* fixed bottom action bar — content scrolls behind (pb clearance above) */}
        <div className="fixed inset-x-0 bottom-0 z-40">
          <div
            className="mx-auto flex w-full max-w-md items-end gap-2.5 px-5 pb-[calc(var(--item-bar-offset)+env(safe-area-inset-bottom))] pt-3.5"
            style={{
              background:
                "linear-gradient(180deg, rgba(11,11,13,0) 0%, var(--bg) 34%)",
            }}
          >
            <AddToBacklog
              catalogItemId={item.id}
              posterUrl={item.posterUrl}
              existingPaletteHex={item.paletteHex}
              backlogs={userBacklogs}
              inBacklogName={entry?.backlogName ?? null}
            />
            {/* F3.8 — before release, two of the three actions are lies:
                "Reproducir" can't play an album that doesn't exist and there is
                no progress to make on it. The wait takes the primary slot and
                simply STATES that the notice is coming (it's automatic — the
                bar informs, it doesn't ask). The play slot survives only as the
                advance singles, and only when there are any. */}
            {releaseIso && upcoming ? (
              <>
                <CountdownBar releaseDate={releaseIso} initialNow={now} />
                {tracks.length > 0 && (
                  <a
                    href={`/api/links/resolve?catalogItemId=${item.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Escuchar los ${tracks.length} adelantos`}
                    className="flex h-[52px] w-[52px] flex-none items-center justify-center gap-1 rounded-full bg-surface-3 text-[13px] text-text transition-transform active:scale-[0.98]"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M6 4.5l14 7.5-14 7.5z" />
                    </svg>
                    {tracks.length}
                  </a>
                )}
              </>
            ) : (
              <>
                <a
                  href={`/api/links/resolve?catalogItemId=${item.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-[52px] flex-1 items-center justify-center gap-2 rounded-full bg-accent text-[15px] font-semibold text-bg transition-transform active:scale-[0.98]"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M6 4.5l14 7.5-14 7.5z" />
                  </svg>
                  {item.mediaType === "album" ? "Reproducir" : "Ver en JustWatch"}
                </a>
                {entry && (
                  <ProgressGesture
                    key={entry.id}
                    catalogItemId={item.id}
                    initialStatus={entry.status}
                  />
                )}
              </>
            )}
          </div>
        </div>
      </main>
    </ItemReactionProvider>
  );
}

import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { auraSeed, parseHex } from "@/lib/color";
import { capitalize } from "@/lib/format";
import {
  getBacklogNames,
  getUserCatalogEntry,
} from "@/modules/backlog/queries";
import { getCatalogItem } from "@/modules/catalog/cache";
import { getItemDisplayMedia } from "@/modules/catalog/display-media";
import { MEDIA_TYPE_TITLE } from "@/modules/catalog/types";
import { AddToBacklog } from "./add-to-backlog";
import { CreditsLink, JustWatchNote } from "./attribution";
import { CloseChip } from "./close-chip";
import { HideDock } from "./hide-dock";
import { ItemHeroAura } from "@/components/item-hero-aura";
import { Tracklist } from "@/components/tracklist";
import { ItemMoreMenu } from "./item-more-menu";
import { ItemShareMenu } from "./item-share-menu";
import { ObsessionGesture } from "./obsession-gesture";
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
  const [item, userBacklogs, entry] = await Promise.all([
    getCatalogItem(catalogItemId),
    getBacklogNames(user.id),
    getUserCatalogEntry(user.id, catalogItemId),
  ]);
  if (!item) notFound();

  // Album tracklist OR film/series Spanish synopsis (English fallback), derived
  // from the source provider and cached — shared with the public item page.
  const { tracks, synopsis } = await getItemDisplayMedia(item);

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
  const meta = [
    MEDIA_TYPE_TITLE[item.mediaType],
    item.byline,
    item.year,
    item.genre && capitalize(item.genre),
  ]
    .filter(Boolean)
    .join(" · ");

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
        />

        {/* top bar: ✕ close + (share · ⋯) — the right chips need a logged entry to act on */}
        <div className="relative z-20 flex items-center justify-between px-4 pt-[calc(16px+env(safe-area-inset-top))]">
          <CloseChip />
          {entry && (
            <div className="flex items-center gap-2.5">
              <ItemShareMenu
                itemId={item.id}
                title={item.title}
                publicUrl={
                  user.username && user.isPublic
                    ? `https://baclog.app/${user.username}/item/${item.id}`
                    : null
                }
              />
              <ItemMoreMenu
                catalogItemId={item.id}
                sourceCrossMediaRecId={entry.sourceCrossMediaRecId}
              />
            </div>
          )}
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
          {synopsis && (
            <p className="mx-auto mt-3.5 max-w-[34ch] text-sm leading-[1.5] text-text-2">
              {synopsis}
            </p>
          )}
        </div>

        {tracks.length > 0 && (
          <div className="relative px-5">
            <Tracklist tracks={tracks} />
          </div>
        )}

        {/* the one prominent reaction (HANDOFF §2) */}
        {entry && (
          <div className="relative mt-6 px-5">
            <ObsessionGesture />
          </div>
        )}

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

        {/* general TMDB/Apple Music attribution lives at /creditos (TMDB's own
            FAQ allows centralizing it in an About/Credits section); the
            JustWatch note stays here, right above the Reproducir button it
            labels, since that one can't be centralized the same way. */}
        <div className="relative mt-10 space-y-2 border-t border-line px-5 pt-4">
          {item.mediaType !== "album" && <JustWatchNote />}
          <CreditsLink />
        </div>

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
            <a
              href={`/api/links/resolve?catalogItemId=${item.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-[52px] flex-1 items-center justify-center gap-2 rounded-full bg-accent text-[15px] font-semibold text-bg transition-transform active:scale-[0.98]"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M6 4.5l14 7.5-14 7.5z" />
              </svg>
              Reproducir
            </a>
            {entry && (
              <ProgressGesture
                key={entry.id}
                catalogItemId={item.id}
                initialStatus={entry.status}
              />
            )}
          </div>
        </div>
      </main>
    </ItemReactionProvider>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import {
  getBacklogNames,
  getUserCatalogEntry,
  getUserPalette,
} from "@/modules/backlog/queries";
import { getTitleStats } from "@/modules/backlog/title-stats";
import { firstRunCoach, getFirstRunCounts } from "@/modules/backlog/first-run";
import { getItemReviewContext } from "@/modules/reviews/queries";
import { legibleAdnPair, supportsSpoiler } from "@/modules/reviews/format";
import {
  getTitleActivityAmongFollowed,
  type TitleActivityRow,
} from "@/modules/social/title-activity";
import { getCatalogItem } from "@/modules/catalog/cache";
import { getItemDisplayMedia } from "@/modules/catalog/display-media";
import {
  getRenderInstant,
  isFreshlyReleased,
  isUpcoming,
  releaseDayShort,
  restArrivesLabel,
} from "@/modules/catalog/release";
import { ReviewsBlock } from "@/components/reviews/reviews-block";
import { Synopsis } from "@/components/synopsis";
import { Tracklist } from "@/components/tracklist";
import { ThemeColorSync } from "@/components/theme-color-sync";
import {
  CountRibbon,
  Cover,
  Glyph,
  Seal,
  SectionTitle,
  type GlyphKind,
} from "@/components/kura/components";
import { releaseSentence, tintSurfaceVertical } from "@/components/kura/tint";
import { CLOCK_PATH } from "@/components/glyph-paths";
import { plural } from "@/lib/plural";
import { SaveSheetHost } from "./add-to-backlog";
import { BackChip } from "./close-chip";
import { getCollectionsIndex } from "./collections-index";
import { CompleteSheetHost } from "./complete-sheet";
import { HideDock } from "./hide-dock";
import { ItemActions, type ReleasePhase } from "./item-actions";
import { CollectionPills, ReleaseNote } from "./item-sections";
import { SERVICE_LABEL } from "./labels";
import { OptionsButton, OptionsSheetHost } from "./options-sheet";
import { ReactionCoach } from "./reaction-coach";
import { ItemReactionProvider } from "./reaction-state";
import { RecoProvenance } from "./reco-reasoning-panel";
import { ToastHost } from "./toast";

/**
 * La ficha (Kura 24a película · 24b serie · 24c álbum · 24d sin estado · 37a
 * en espera · C4 HOY · 37c álbum anunciado — design/kura/flujos-v2).
 *
 * The header is the title's own tinted surface (180°, fused into --bg in its
 * last third — no glow, no aura): Volver and Opciones at 64/24, the cover
 * centred (200×300 · album 240×240), the title in Newsreader italic 30, the
 * byline, the mono data line, the ribbon of counts, and the three fixed
 * actions. Everything secondary lives in Opciones. Below, the sections in
 * Newsreader 24: dónde ver / escuchar, the synopsis or the songs, gente que
 * sigues, reseñas, en tus colecciones.
 *
 * Status and reaction are ONLY editable here, through the Completar slider.
 * Omitted because the product has no data for them (never invented): the
 * "gustan" / "guardados" / "esperando" counts, runtime, per-service
 * availability ("Incluido / Renta", region), episodes and next-season dates,
 * "también de {autor}".
 */
export default async function ItemPage({
  params,
}: {
  params: Promise<{ catalogItemId: string }>;
}) {
  const user = await requireUser();
  const { catalogItemId } = await params;
  const [item, userBacklogs, entry, reviews, viewerPalette, counts, stats, collections] =
    await Promise.all([
      getCatalogItem(catalogItemId),
      getBacklogNames(user.id),
      getUserCatalogEntry(user.id, catalogItemId),
      // F3.9 — own review + the first page of everyone else's, in one trip.
      getItemReviewContext(user.id, catalogItemId),
      getUserPalette(user.id, 2),
      // First-run moment 3: has the user ever judged a title?
      getFirstRunCounts(user.id),
      // The ribbon: a count across every account, never an identity.
      getTitleStats(catalogItemId),
      // "guardar en": last collection used + a cover per collection.
      getCollectionsIndex(user.id),
    ]);
  if (!item) notFound();

  const viewerHexes = legibleAdnPair(viewerPalette);

  // Album tracklist OR film/series Spanish synopsis — derived from the source
  // provider and cached, shared with the public ficha. For an album this also
  // refreshes catalog_item.release_date (F3.8): read the release off the
  // returned value, not the row loaded before it.
  const [{ tracks, trackCount, synopsis, releaseDate, seriesStatus }, friends] =
    await Promise.all([
      getItemDisplayMedia(item),
      getTitleActivityAmongFollowed(user.id, item.id, {
        limit: 4,
        mediaType: item.mediaType,
      }),
    ]);

  // F3.8 — ONE server instant for every release label on the page, so SSR and
  // hydration agree. The wait is derived here and nowhere else.
  const now = await getRenderInstant();
  const phase: ReleasePhase = isUpcoming(releaseDate, now)
    ? "waiting"
    : isFreshlyReleased(releaseDate, now)
      ? "today"
      : "out";

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
          linkKind: (entry.recLinkType && entry.recLinkType !== "thematic"
            ? "factual"
            : "thematic") as "factual" | "thematic",
        }
      : null;

  const isAlbum = item.mediaType === "album";
  const palette = item.paletteHex ?? [];
  const linkHref = `/api/links/resolve?catalogItemId=${item.id}`;
  const service = SERVICE_LABEL[user.preferredService ?? "spotify"];
  const allowSpoiler = supportsSpoiler(item.mediaType);
  const songs = trackCount || tracks.length;

  // The mono data line (24a "2001 · 125 min", 24b "2022 · 2 temporadas", 24c
  // "2024 · 12 canciones"): only what the catalog stores — no runtime.
  const meta = [
    item.year,
    seriesStatus ? `${seriesStatus.seasons} ${plural(seriesStatus.seasons, "temporada", "temporadas")}` : null,
    isAlbum && songs > 0 ? `${songs} ${plural(songs, "canción", "canciones")}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const work = {
    id: item.id,
    title: item.title,
    mediaType: item.mediaType,
    year: item.year,
    byline: item.byline,
    posterUrl: item.posterUrl,
    paletteHex: item.paletteHex ?? null,
  };
  const publicUrl =
    user.username && user.isPublic ? `https://baclog.app/${user.username}/item/${item.id}` : null;

  return (
    // key: a title added/removed during the visit is tracked by the provider
    // itself; the key only re-seeds when a NAVIGATION lands on another entry.
    <ItemReactionProvider
      key={entry?.id ?? "none"}
      catalogItemId={item.id}
      posterUrl={item.posterUrl}
      paletteHex={item.paletteHex ?? null}
      backlogs={userBacklogs}
      collections={collections}
      initialMemberIds={entry ? entry.backlogs.map((b) => b.id) : []}
      initialVerdict={entry?.verdict ?? null}
      initialObsessed={entry?.obsessed ?? false}
      initialCompleted={entry?.status === "completed"}
      initialOwnReview={reviews.own}
    >
      <main className="relative mx-auto min-h-dvh w-full max-w-md overflow-x-clip bg-bg pb-14 text-text">
        <HideDock />
        {/* Safari's status-bar band tints from theme-color — match the cover. */}
        <ThemeColorSync color={palette[0]} />

        <header
          className="relative flex flex-col items-center gap-3 px-6 pb-[30px] pt-[calc(124px+env(safe-area-inset-top))]"
          style={{ background: tintSurfaceVertical(palette) }}
        >
          <div className="absolute inset-x-6 top-[calc(64px+env(safe-area-inset-top))] z-[2] flex items-center justify-between">
            <BackChip />
            <OptionsButton />
          </div>

          <span className="relative block">
            <Cover
              posterUrl={item.posterUrl}
              paletteHex={palette}
              mediaType={item.mediaType}
              alt={`Portada de ${item.title}`}
              className={isAlbum ? "h-[240px] w-[240px]" : "h-[300px] w-[200px]"}
            />
            {/* C4 — the release day: the clock is out, "hoy" sits on the cover. */}
            {phase === "today" && (
              <span className="absolute left-2.5 top-2.5 inline-flex h-7 items-center gap-1.5 rounded-full bg-st-waiting pl-[9px] pr-[11px] font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-bg">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden className="flex-none">
                  <path d={CLOCK_PATH} />
                </svg>
                hoy
              </span>
            )}
          </span>

          <h1 className="mt-2.5 text-center font-brand text-[30px] italic leading-[1.05] text-text text-balance [overflow-wrap:anywhere]">
            {item.title}
          </h1>
          {item.byline && <p className="-mt-0.5 text-center text-[15px] text-text-2">{item.byline}</p>}
          {meta && (
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">{meta}</span>
          )}
          <CountRibbon
            className="mt-0.5"
            counts={[
              { kind: "obsessed", n: stats.obsessed, label: "obsesionados" },
              { kind: "completed", n: stats.completed, label: "completos" },
            ]}
          />
          <ItemActions
            phase={phase}
            releaseLine={phase === "waiting" && releaseDate ? releaseSentence(releaseDate, now) : null}
            note={seriesStatus?.kind === "airing" ? "En emisión" : null}
          />
        </header>

        <div className="flex flex-col gap-[30px] px-6 pt-2.5">
          {/* Rendered unconditionally — it freezes `pending` itself (see the
              component's note on revalidation). */}
          <ReactionCoach pending={firstRunCoach(counts).item} />

          {isAlbum ? (
            phase === "waiting" ? (
              tracks.length > 0 &&
              releaseDate && (
                <section className="flex flex-col gap-1">
                  <SectionTitle>dónde escuchar</SectionTitle>
                  <ServiceRow href={linkHref} mark={<MusicMark />} label={`Abrir en ${service}`} />
                  <ReleaseNote
                    phase="waiting"
                    day={releaseDayShort(releaseDate)}
                    pendingTracks={Math.max(0, trackCount - tracks.length)}
                    arrives={restArrivesLabel(releaseDate, now)}
                  />
                </section>
              )
            ) : (
              <a
                href={linkHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-12 items-center gap-2 self-start rounded-full bg-[var(--glass-bg)] pl-5 pr-[18px] text-[16px] font-semibold text-text bl-press hover:bg-white/[0.12]"
              >
                Abrir en {service}
                <ArrowOut />
              </a>
            )
          ) : (
            <section className="flex flex-col gap-1">
              <SectionTitle>dónde ver</SectionTitle>
              {phase === "waiting" ? (
                releaseDate && <ReleaseNote phase="waiting" day={releaseDayShort(releaseDate)} />
              ) : (
                <>
                  {/* TMDB's watch/providers guidance: the row carries the
                      JustWatch attribution. Per-service rows ("Incluido /
                      Renta") need data the product doesn't store. */}
                  <ServiceRow
                    href={linkHref}
                    mark="jw"
                    label="JustWatch"
                    aside={phase === "today" ? "desde hoy" : "Ver dónde"}
                    asideTone={phase === "today" ? "waiting" : "quiet"}
                  />
                  {phase === "today" && releaseDate && (
                    <ReleaseNote phase="today" day={releaseDayShort(releaseDate)} />
                  )}
                </>
              )}
            </section>
          )}

          {synopsis && (
            <Synopsis text={synopsis} className="text-[15px] leading-[1.55] text-text" />
          )}

          {tracks.length > 0 && (
            // Before release the aside reads "12 de 16 disponibles"; when the
            // rest arrives is said once, under "dónde escuchar".
            <Tracklist tracks={tracks} totalCount={phase === "waiting" ? trackCount : undefined} />
          )}

          {/* AI provenance: why this pairing + the user's own why-feedback.
              NO reco teaser here (founder decision 2026-07-09). */}
          {entry && narrative && (
            <RecoProvenance narrative={narrative} sourceCrossMediaRecId={entry.sourceCrossMediaRecId} />
          )}

          {friends.total > 0 && (
            <section className="flex flex-col gap-3">
              <SectionTitle aside={friends.total > friends.rows.length ? friends.total : undefined}>
                gente que sigues
              </SectionTitle>
              <div className="flex flex-col">
                {friends.rows.map((f) => (
                  <FriendRow key={f.username} row={f} />
                ))}
              </div>
            </section>
          )}

          {/* F3.9 — reseñas. Reading the conversation is never gated, only
              writing is. */}
          <ReviewsBlock
            catalogItemId={item.id}
            itemTitle={item.title}
            allowSpoiler={allowSpoiler}
            viewerIsPublic={Boolean(user.username && user.isPublic)}
            viewerHexes={viewerHexes}
            viewerAvatarUrl={user.image}
            viewerName={user.username ?? user.name ?? "tú"}
            context={reviews}
          />

          <CollectionPills />
        </div>

        {/* Sheets and the aviso — portaled to <body> by their components. */}
        <SaveSheetHost work={work} />
        <CompleteSheetHost allowSpoiler={allowSpoiler} />
        <OptionsSheetHost
          work={work}
          publicUrl={publicUrl}
          upcoming={phase === "waiting"}
          recId={narrative ? (entry?.sourceCrossMediaRecId ?? null) : null}
        />
        <ToastHost />
      </main>
    </ItemReactionProvider>
  );
}

/* --------------------------------------------------------------- piezas */

function ArrowOut() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="flex-none">
      <path d="M7 17L17 7M9 7h8v8" />
    </svg>
  );
}

function MusicMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 18V5l12-2v13M9 18a3 3 0 11-6 0 3 3 0 016 0zM21 16a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

/** A "dónde ver" row (24a): logo 40 on --s2, name 16/500, mono aside, the arrow. */
function ServiceRow({
  href,
  mark,
  label,
  aside,
  asideTone = "quiet",
}: {
  href: string;
  mark: React.ReactNode;
  label: string;
  aside?: string;
  asideTone?: "quiet" | "waiting";
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex min-h-14 items-center gap-3.5 transition-opacity active:opacity-70"
    >
      <span aria-hidden className="flex h-10 w-10 flex-none items-center justify-center rounded-[10px] bg-surface-2 font-mono text-[12px] font-medium text-text">
        {mark}
      </span>
      <span className="min-w-0 flex-1 truncate text-[16px] font-medium text-text">{label}</span>
      {aside && (
        <span className={`font-mono text-[11px] uppercase tracking-[0.08em] ${asideTone === "waiting" ? "text-st-waiting" : "text-text-2"}`}>
          {aside}
        </span>
      )}
      <span className="flex text-text-2">
        <ArrowOut />
      </span>
    </a>
  );
}

/** Third person for other people's state (§voz: "Me gusta · Le gusta"). */
const FRIEND_STATE: Record<NonNullable<TitleActivityRow["state"]>, { kind: GlyphKind; label: string }> = {
  obsessed: { kind: "obsessed", label: "Le obsesiona" },
  liked: { kind: "liked", label: "Le gusta" },
  done: { kind: "completed", label: "Completo" },
};

/** "gente que sigues" row (24a): seal 36, @handle 15/500, glyph 14 + mono label. */
function FriendRow({ row }: { row: TitleActivityRow }) {
  const state = row.state ? FRIEND_STATE[row.state] : null;
  const label = state?.label ?? row.what.charAt(0).toUpperCase() + row.what.slice(1);
  return (
    <Link
      href={`/u/${row.username}`}
      className="flex min-h-[52px] items-center gap-3 transition-opacity active:opacity-70"
    >
      <Seal name={row.username} hexes={row.avatarHexes} src={row.avatarUrl} size={36} />
      <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-text">@{row.username}</span>
      <span className="flex flex-none items-center gap-[7px] font-mono text-[11px] uppercase tracking-[0.06em] text-text-2">
        <Glyph kind={state?.kind ?? "review"} size={14} />
        {label}
      </span>
    </Link>
  );
}

import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/auth";
import {
  getPublicProfile,
  getPublicReactionCounts,
} from "@/modules/backlog/public";
import { getProfileReviews } from "@/modules/reviews/queries";
import { isFollowing } from "@/modules/social/queries";
import { getAffinity } from "@/modules/social/affinity";
import { FollowButton } from "@/components/follow-button";
import { ProfileReviews } from "@/components/reviews/profile-reviews";
import { captureView } from "@/modules/analytics/capture";
import { plural } from "@/lib/plural";
import { ShareChip } from "@/app/u/share-chip";
import { BackButton } from "@/components/ui";
import {
  BrandLockup,
  CollectionCard,
  Cover,
  CreditsLink,
  CtaCard,
  EnterPill,
  Glyph,
  type GlyphKind,
  Seal,
  SectionTitle,
} from "@/components/kura/components";
import { tintSurfaceVertical } from "@/components/kura/tint";
import { ReportButton } from "./report-button";

// Dynamic (not ISR) on purpose: F3.4 captures viewer geo/device server-side
// via headers() for a reliable, ad-blocker-proof ADR-000 signal. At M3 scale
// the lost ISR caching is negligible; revisit with a beacon if load grows.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const profile = await getPublicProfile((await params).username);
  if (!profile) return {};
  // OG image = the first collection's first cover, so the primary share
  // destination previews with an image (consistent with [backlogId]/page.tsx).
  const firstPoster = profile.backlogs
    .flatMap((b) => b.coverUrls)
    .find(Boolean);
  return {
    title: `${profile.displayName} · kura`,
    description: `Las colecciones de ${profile.displayName}: películas, series y música.`,
    openGraph: {
      title: `${profile.displayName} en kura`,
      description: `${profile.backlogs.length} ${plural(profile.backlogs.length, "colección", "colecciones")}.`,
      type: "profile",
      ...(firstPoster ? { images: [firstPoster] } : {}),
    },
  };
}

/** A glass pill of the ribbon: glyph 12 + mono 12 count (33a). */
function StatPill({ kind, n, label }: { kind: GlyphKind; n: number; label: string }) {
  return (
    <span
      aria-label={`${n} ${label}`}
      className="inline-flex items-center gap-[7px] rounded-full bg-[var(--glass-bg)] px-3 py-[7px] font-mono text-[12px] leading-none text-text"
    >
      <Glyph kind={kind} size={12} />
      {n}
    </span>
  );
}

/**
 * Kura · 33a perfil público web (design/kura/flujos-v2.dc.html, flujo 12):
 * the header tinted by the owner's palette (180°, fused into the page), the
 * brand lockup and the way into the app at 64, the photo or seal at 128, the
 * name in Newsreader 40, the handle, followers · following, the ribbon of
 * glass pills (one count per state), and Seguir in honey beside Compartir.
 * Then "le obsesiona" as a strip of covers, the collections as compact cards
 * (spine + covers at 104), what they wrote, and the CTA card.
 */
export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const [profile, counts, reviews] = await Promise.all([
    getPublicProfile(username),
    getPublicReactionCounts(username),
    // Public-gated inside the query, so a private handle simply returns [].
    getProfileReviews(username),
  ]);
  // Private and nonexistent are identical 404s — no enumeration oracle
  if (!profile || !counts) notFound();

  captureView({
    eventType: "public_profile_view",
    targetUsername: profile.username,
    headers: await headers(),
  });

  const viewer = await getCurrentUser();
  // F3.10 — the follow control beside the name. The owner sees neither state.
  const isOwner = viewer?.username === profile.username;
  const [viewerFollows, affinity] = await Promise.all([
    viewer && !isOwner ? isFollowing(viewer.id, profile.username) : false,
    // Signed-in, not the owner: what the two of you share (affinity.ts gates
    // the profile's side on its public backlogs; the owner gets null).
    viewer && !isOwner ? getAffinity(viewer.id, profile.username) : null,
  ]);

  const affinityLine = affinityCopy(affinity);
  const itemHref = (id: string) => `/u/${profile.username}/item/${id}`;
  // The tint comes from the covers of what they keep (public.ts aggregates
  // the dominant hexes); the lima fallback of the old aura is not a Kura
  // colour, so a paletteless profile is simply `--bg`.
  const palette = profile.palette.filter((h) => h.toLowerCase() !== "#d8ff3e");
  const collectionCount = profile.backlogs.length;

  return (
    <div className="kura relative mx-auto min-h-dvh w-full max-w-md overflow-x-clip bg-bg text-text">
      <header
        className="flex flex-col gap-[18px] px-6 pb-[34px] pt-[calc(64px+env(safe-area-inset-top))]"
        style={{ background: tintSurfaceVertical(palette) }}
      >
        <div className="flex items-center justify-between">
          {/* A signed-in viewer came from inside the app (a feed card, a row
              of people): Volver takes them back. Anonymous: the brand and
              the way in (33a). */}
          {viewer ? <BackButton className="h-11! w-11!" /> : <BrandLockup />}
          {!viewer && <EnterPill />}
        </div>

        <Seal name={profile.displayName || profile.username} hexes={palette} src={profile.avatarUrl} size={128} />

        <div className="flex flex-col gap-1.5">
          {/* overflow-wrap: a 50-char display name (or one long token) must
              wrap inside the column, not run off the screen. */}
          <h1 className="font-brand text-[40px] leading-none text-text [overflow-wrap:anywhere]">
            {profile.displayName.toLowerCase()}
          </h1>
          <span className="font-mono text-[12px] text-text-2">
            @{profile.username}
            {profile.isFounder && <span className="uppercase tracking-[0.08em]"> · fundador</span>}
          </span>
          <div className="flex gap-4 text-[14px] text-text-2">
            <span>
              <b className="font-semibold text-text">{profile.followerCount}</b>{" "}
              {plural(profile.followerCount, "seguidor", "seguidores")}
            </span>
            <span>
              <b className="font-semibold text-text">{profile.followingCount}</b> siguiendo
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-[7px]">
          <StatPill kind="obsessed" n={counts.obsessed} label="le obsesionan" />
          <StatPill kind="completed" n={counts.completed} label="completos" />
          <StatPill kind="liked" n={counts.liked} label="le gustan" />
          <StatPill kind="review" n={reviews.length} label={plural(reviews.length, "reseña", "reseñas")} />
        </div>

        <div className="flex items-center gap-2">
          {!isOwner &&
            (viewer ? (
              <FollowButton username={profile.username} initialFollowing={viewerFollows} variant="kura" />
            ) : (
              // Anonymous: the same honey pill leads into the account flow
              // (§patrones · links y cuenta — the action completes itself
              // once the registration ends; today it lands on /login).
              <Link
                href="/login"
                className="inline-flex h-12 items-center justify-center rounded-full bg-honey px-7 font-sans text-[16px] font-semibold text-bg bl-press active:bg-honey-press"
              >
                Seguir
              </Link>
            ))}
          <ShareChip path={`/u/${profile.username}`} label={`Compartir el perfil de ${profile.displayName}`} className="h-11! w-11!" />
          {affinityLine && (
            <span className="min-w-0 flex-1 text-[13px] leading-[1.4] text-text-2">{affinityLine}</span>
          )}
        </div>
      </header>

      <main className="flex flex-col gap-[30px] pb-[150px] pt-2">
        {/* le obsesiona — the strip of what they can't stop recommending. */}
        {profile.obsessions.length > 0 && (
          <section className="flex flex-col gap-3.5">
            <div className="px-5">
              <SectionTitle>le obsesiona</SectionTitle>
            </div>
            <div className="bl-scroll flex items-end gap-3 overflow-x-auto px-5 pb-6">
              {profile.obsessions.map((o) => (
                <Link key={o.catalogItemId} href={itemHref(o.catalogItemId)} className="flex-none bl-press-lg">
                  <Cover posterUrl={o.posterUrl} paletteHex={o.paletteHex} mediaType={o.mediaType} alt={o.title} className="h-[150px]" />
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* En común contigo — signed-in only, and only titles the owner keeps
            on a public collection (affinity.ts). */}
        {affinity && affinity.common.length > 0 && (
          <section className="flex flex-col gap-3.5">
            <div className="px-5">
              <SectionTitle aside={`${affinity.common.length}`}>en común contigo</SectionTitle>
            </div>
            <div className="bl-scroll flex items-end gap-3 overflow-x-auto px-5 pb-6">
              {affinity.common.map((it) => (
                <Link key={it.catalogItemId} href={itemHref(it.catalogItemId)} className="flex-none bl-press-lg">
                  <Cover posterUrl={it.posterUrl} paletteHex={it.paletteHex} mediaType={it.mediaType} alt={it.title} className="h-[150px]" />
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* colecciones — the escaparate (F3.10.1: public AND on the profile),
            each the compact collection card: spine + covers at 104. */}
        {collectionCount > 0 && (
          <section className="flex flex-col gap-3.5">
            <div className="flex items-baseline justify-between gap-3 px-5">
              <h2 className="font-brand text-[24px] leading-[1.1] text-text">colecciones</h2>
              <span className="text-[14px] font-medium text-text-2">{collectionCount}</span>
            </div>
            <div className="flex flex-col gap-3 px-3">
              {profile.backlogs.map((b) => (
                <CollectionCard
                  key={b.id}
                  name={b.name}
                  href={`/u/${profile.username}/${b.id}`}
                  height={104}
                  paletteHex={b.paletteHex.filter((h) => h.toLowerCase() !== "#d8ff3e")}
                  emptyLabel={`${b.itemCount} ${plural(b.itemCount, "título", "títulos")}`}
                  covers={b.covers.map((c) => ({
                    posterUrl: c.posterUrl,
                    paletteHex: c.paletteHex,
                    mediaType: c.mediaType,
                  }))}
                />
              ))}
            </div>
          </section>
        )}

        {/* F3.9 — "lo que dice X". Renders nothing until they've written one. */}
        <ProfileReviews username={profile.username} displayName={profile.displayName} reviews={reviews} />

        {!viewer && <CtaCard className="mx-5" />}

        <div className="flex flex-col items-center gap-4">
          <ReportButton username={profile.username} />
          <CreditsLink />
        </div>
      </main>
    </div>
  );
}

/**
 * "Siguen a @luciarrr y 3 más · 4 títulos en común". Each half only when it
 * has something to say; null when neither does (the button then sits alone).
 */
function affinityCopy(
  affinity: Awaited<ReturnType<typeof getAffinity>>,
): React.ReactNode | null {
  if (!affinity) return null;
  const parts: React.ReactNode[] = [];
  if (affinity.shared) {
    const { firstUsername, more } = affinity.shared;
    parts.push(
      <span key="shared">
        Siguen a @{firstUsername}
        {more > 0 ? ` y ${more} más` : ""}
      </span>,
    );
  }
  if (affinity.commonTitles > 0) {
    const n = affinity.commonTitles;
    parts.push(
      <span key="titles">
        <b className="font-semibold text-text">
          {n} {plural(n, "título", "títulos")}
        </b>{" "}
        en común
      </span>,
    );
  }
  if (parts.length === 0) return null;
  return parts.flatMap((p, i) => (i ? [" · ", p] : [p]));
}

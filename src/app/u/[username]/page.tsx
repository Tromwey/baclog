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
import { initialOf } from "@/modules/reviews/queries";
import { isFollowing } from "@/modules/social/queries";
import { getAffinity } from "@/modules/social/affinity";
import { FollowButton } from "@/components/follow-button";
import { followPillClass } from "@/components/follow-pill";
import { ProfileReviews } from "@/components/reviews/profile-reviews";
import { ProfileAvatar } from "@/components/profile-avatar";
import { posterFallbackStyle } from "@/components/cover-tile";
import { captureView } from "@/modules/analytics/capture";
import { plural } from "@/lib/plural";
import { UpcomingShelf } from "@/components/upcoming-shelf";
import { getRenderInstant } from "@/modules/catalog/release";
import { BackButton, StrokeIcon, glassPillClass } from "@/components/ui";
import { CHEVRON_RIGHT_PATH, SPARKLE_PATH } from "@/components/glyph-paths";
import { ShareChip } from "@/app/u/share-chip";
import { ProfileBackdrop } from "@/app/u/profile-backdrop";
import { ProfileStatPills } from "@/app/u/profile-stat-pills";
import { CoverStrip } from "@/app/u/cover-strip";
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
  // OG image = the first backlog's first cover, so the primary share
  // destination previews with an image (consistent with backlog/page.tsx).
  const firstPoster = profile.backlogs
    .flatMap((b) => b.coverUrls)
    .find(Boolean);
  return {
    title: `${profile.displayName} · Baclog`,
    description: `Los backlogs de ${profile.displayName} — películas, series y música.`,
    openGraph: {
      title: `${profile.displayName} en Baclog`,
      description: `${profile.backlogs.length} backlogs de obsesiones.`,
      type: "profile",
      ...(firstPoster ? { images: [firstPoster] } : {}),
    },
  };
}

/**
 * Screen 10 (Revamp UI, 2026-09-03) — someone's public profile: their ADN
 * glow, the 72px orb, the Bricolage name, the three stat pills, the follow
 * button beside what you have in common, the "En común contigo" strip, then
 * their backlogs as rows with a fan of covers.
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

  // One server instant for every countdown on the page (see countdown.tsx).
  const now = await getRenderInstant();
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

  return (
    <div
      className={`relative mx-auto min-h-dvh w-full max-w-md overflow-x-clip bg-bg text-text ${
        viewer ? "pb-[140px]" : "pb-[150px]"
      }`}
    >
      <ProfileBackdrop palette={profile.palette} midStop={55} />

      <div className="relative">
        {/* Header — back (a signed-in viewer returns wherever they came from;
            a cold deep-link lands at the root) and share. */}
        <header className="flex items-center justify-between px-5 pt-[calc(12px+env(safe-area-inset-top))]">
          {viewer ? <BackButton /> : <BackButton href="/" />}
          <ShareChip
            path={`/u/${profile.username}`}
            label={`Compartir el perfil de ${profile.displayName}`}
          />
        </header>

        {/* Identity */}
        <div className="flex flex-col gap-1.5 px-6 pt-[18px]">
          <ProfileAvatar
            src={profile.avatarUrl}
            palette={profile.palette}
            initial={initialOf(profile.displayName || profile.username)}
          />
          {/* overflow-wrap: a 50-char display name (or one long token) must
              wrap inside the column, not run off the screen. */}
          <h1 className="mt-3 font-display text-[44px] font-extrabold leading-none tracking-[-0.02em] text-text [overflow-wrap:anywhere]">
            {profile.displayName}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-2">
              baclog.app/{profile.username}
            </span>
            {profile.isFounder && (
              <span className={`${glassPillClass} px-2.5 py-1 text-accent`}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d={SPARKLE_PATH} />
                </svg>
                Fundador
              </span>
            )}
          </div>

          <ProfileStatPills counts={counts} className="mt-3.5" />

          {!isOwner && (
            <div className="mt-[18px] flex items-center gap-3">
              {viewer ? (
                <FollowButton
                  username={profile.username}
                  initialFollowing={viewerFollows}
                  variant="hero"
                />
              ) : (
                // Same recipe as the real pill (followPillClass) so the
                // logged-out conversion path can't drift from the button.
                <Link href="/login" className={followPillClass}>
                  Seguir
                </Link>
              )}
              {affinityLine && (
                <span className="flex-1 text-[12.5px] leading-[1.3] text-text-2">
                  {affinityLine}
                </span>
              )}
            </div>
          )}
        </div>

        {/* En común contigo — signed-in only, and only titles the owner keeps
            on a public backlog (affinity.ts). */}
        {affinity && (
          <CoverStrip
            label="En común contigo"
            items={affinity.common}
            height="h-[150px]"
            itemHref={itemHref}
            className="pt-[30px]"
          />
        )}

        {/* F3.8 — what they're waiting for. Third person here ("No puede
            esperar"): the visitor is reading someone else's anticipation.
            Renders nothing when there's nothing coming. */}
        <UpcomingShelf
          items={profile.upcoming}
          initialNow={now}
          heading="No puede esperar"
          itemHref={itemHref}
          inset="px-6"
          className="pt-[30px]"
        />

        {/* Sus backlogs — the escaparate (F3.10.1: public AND on the profile),
            each a row with a fan of its three newest covers. */}
        {profile.backlogs.length > 0 && (
          <section className="flex flex-col gap-3.5 px-6 pt-[26px]">
            <h2 className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-text-3">
              Sus backlogs · {profile.backlogs.length}
            </h2>
            {profile.backlogs.map((b) => (
              <Link
                key={b.id}
                href={`/u/${profile.username}/${b.id}`}
                className="flex items-center gap-3.5"
              >
                <span className="flex pl-3" aria-hidden>
                  {b.covers.map((c, i) => (
                    <span
                      key={i}
                      className="-ml-3 h-[46px] w-[34px] flex-none overflow-hidden rounded-[6px] bg-surface-2 shadow-[0_8px_20px_-8px_rgba(0,0,0,.8)] ring-[1.5px] ring-bg"
                      style={c.posterUrl ? undefined : posterFallbackStyle(c.paletteHex)}
                    >
                      {c.posterUrl && (
                        // eslint-disable-next-line @next/next/no-img-element -- hotlinked external CDN (ADR-007)
                        <img
                          src={c.posterUrl}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover"
                        />
                      )}
                    </span>
                  ))}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                  <span className="truncate font-serif text-[19px] italic leading-[1.1] text-text">
                    {b.name}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-3">
                    {b.itemCount} {plural(b.itemCount, "título", "títulos")}
                  </span>
                </span>
                <StrokeIcon
                  d={CHEVRON_RIGHT_PATH}
                  size={14}
                  strokeWidth={2.4}
                  className="flex-none text-text-3"
                />
              </Link>
            ))}
          </section>
        )}

        {/* F3.9 — "Lo que dice X". Renders nothing until they've written one. */}
        <ProfileReviews
          username={profile.username}
          displayName={profile.displayName}
          reviews={reviews}
        />

        <div className="pt-8 text-center">
          <ReportButton username={profile.username} />
        </div>
      </div>

      {/* Anonymous visitors: the conversion CTA over a fade (06b's recipe).
          F3.10 pitches the social loop ("seguirle": the neutral MX form). */}
      {!viewer && (
        <>
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
              Regístrate para seguirle →
            </Link>
            <span className="text-center text-[12px] text-text-3">
              Guarda, marca y comparte lo que te obsesiona
            </span>
          </div>
        </>
      )}
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

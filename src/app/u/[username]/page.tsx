import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Sparkles } from "lucide-react";
import { getCurrentUser } from "@/auth";
import { getPublicProfile } from "@/modules/backlog/public";
import { getProfileReviews } from "@/modules/reviews/queries";
import { isFollowing } from "@/modules/social/queries";
import { FollowButton, followPillClass } from "@/components/follow-button";
import { ProfileReviews } from "@/components/reviews/profile-reviews";
import { ProfileAvatar } from "@/components/profile-avatar";
import { captureView } from "@/modules/analytics/capture";
import { plural } from "@/lib/plural";
import { UpcomingShelf } from "@/components/upcoming-shelf";
import { getRenderInstant } from "@/modules/catalog/release";
import {
  AuraField,
  BackButton,
  Button,
  MonoMeta,
  StatusChip,
} from "@/components/ui";
import {
  ShelfCard,
  shelfSeed,
} from "@/app/(app)/backlogs/backlog-shelf-card";
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

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const [profile, reviews] = await Promise.all([
    getPublicProfile(username),
    // Public-gated inside the query, so a private handle simply returns [].
    getProfileReviews(username),
  ]);
  // Private and nonexistent are identical 404s — no enumeration oracle
  if (!profile) notFound();

  captureView({
    eventType: "public_profile_view",
    targetUsername: profile.username,
    headers: await headers(),
  });

  const totalItems = profile.backlogs.reduce((n, b) => n + b.itemCount, 0);
  // One server instant for every countdown on the page (see countdown.tsx).
  const now = await getRenderInstant();
  // Logged-in viewers (e.g. the owner via "ver perfil público") need a way back
  // and don't need the "start a backlog" pitch — that's for anonymous visitors.
  const viewer = await getCurrentUser();
  // F3.10 — the follow control beside the name. The owner sees neither state.
  const isOwner = viewer?.username === profile.username;
  const viewerFollows =
    viewer && !isOwner ? await isFollowing(viewer.id, profile.username) : false;

  return (
    <div className="relative mx-auto min-h-dvh w-full max-w-md overflow-hidden bg-bg text-text">
      {/* The owner's persistent ADN aura (their palette, same seed as the
          in-app aura) blooming behind the hero. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[400px]"
      >
        <AuraField
          variant="ambient"
          colors={profile.palette}
          seed={7}
          className="!opacity-[0.6]"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, transparent 28%, rgba(11,11,13,0.5) 58%, #0B0B0D 86%)",
          }}
        />
      </div>

      {/* Top bar — same px-4 / pt-[24px+safe] as the backlog & item back chip so
          the control sits in the SAME spot across every public screen. Only for
          a signed-in viewer; anonymous visitors get no back (the profile is the
          root of the public space). When present it owns the safe-area, so main
          drops it (pt-5) to avoid double-counting the notch inset. */}
      {viewer && (
        <div className="relative flex px-4 pt-[calc(24px+env(safe-area-inset-top))]">
          <BackButton />
        </div>
      )}
      <main
        className={`relative px-5 pb-32 ${
          viewer ? "pt-5" : "pt-[calc(20px+env(safe-area-inset-top))]"
        }`}
      >
        <header className="bl-rise">
          {/* F3.11 — the same identity disc as /perfil: their photo, or their
              ADN as an orb (same palette and seed as the hero aura behind it,
              so orb and aura read as one light). */}
          <ProfileAvatar
            src={profile.avatarUrl}
            palette={profile.palette}
            seed={7}
            className="mb-4 h-[68px] w-[68px] shadow-[0_10px_28px_rgba(0,0,0,0.5)]"
          />
          {/* F3.10 — the @handle replaces baclog.app/… on the profile screens. */}
          <MonoMeta className="text-text-2">@{profile.username}</MonoMeta>
          <div className="mt-2 flex items-end gap-3.5">
            {/* overflow-wrap: a 50-char display name (or one long token) must
                wrap inside its narrowed column, not clip under the page's
                overflow-hidden. */}
            <h1 className="min-w-0 flex-1 font-display text-[40px] font-extrabold leading-none tracking-[-0.02em] [overflow-wrap:anywhere]">
              {profile.displayName}
            </h1>
            {!isOwner &&
              (viewer ? (
                <FollowButton
                  username={profile.username}
                  initialFollowing={viewerFollows}
                  size="lg"
                  className="mb-0.5"
                />
              ) : (
                // Same recipe as the real pill (followPillClass) so the
                // logged-out conversion path can't drift from the button.
                <Link href="/login" className={`mb-0.5 ${followPillClass}`}>
                  Seguir
                </Link>
              ))}
          </div>
          {profile.isFounder && (
            <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 font-mono text-[11px] uppercase tracking-[0.06em] text-accent">
              <Sparkles size={12} /> Fundador
            </span>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <StatusChip tone="completed" glass>
              {profile.backlogs.length}{" "}
              {plural(profile.backlogs.length, "backlog", "backlogs")}
            </StatusChip>
            <StatusChip tone="obsessed" glass>
              {totalItems} {plural(totalItems, "obsesión", "obsesiones")}
            </StatusChip>
            <StatusChip tone="neutral" glass>
              {profile.followerCount}{" "}
              {plural(profile.followerCount, "seguidor", "seguidores")}
            </StatusChip>
          </div>
        </header>

        {/* F3.8 — what they're waiting for, above what they already have. Third
            person here ("No puede esperar"): the visitor is reading someone
            else's anticipation, not their own. Renders nothing when there's
            nothing coming. */}
        <UpcomingShelf
          items={profile.upcoming}
          initialNow={now}
          heading="No puede esperar"
          itemHref={(id) => `/u/${profile.username}/item/${id}`}
          // -mx-5 cancels main's padding so the carousel can bleed to the
          // screen edge like it does inside a backlog.
          className="-mx-5 mt-9"
        />

        {/* The owner's backlogs as ADN-aura shelves — same language as the
            in-app Backlogs list. Each links to the public backlog view. */}
        <section className="mt-10">
          <MonoMeta>Sus backlogs</MonoMeta>
          <div className="mt-2">
            {profile.backlogs.map((b) => (
              <Link
                key={b.id}
                href={`/u/${profile.username}/${b.id}`}
                className="mt-4 block"
              >
                <ShelfCard
                  name={b.name}
                  itemCount={b.itemCount}
                  paletteHex={b.paletteHex}
                  seed={shelfSeed(b.id)}
                />
              </Link>
            ))}
          </div>
        </section>

        {/* F3.9 — "Lo que dice X". Renders nothing until they've written one. */}
        <ProfileReviews username={profile.username} reviews={reviews} />

        <div className="mt-10 text-center">
          <ReportButton username={profile.username} />
        </div>
      </main>

      {/* Sticky lima CTA — the conversion pill (§6). Only for anonymous
          visitors; logged-in users get a back button instead. F3.10 pivots the
          pitch from "start a backlog" to the social loop ("seguirle": the
          neutral MX form — we don't know anyone's gender). */}
      {!viewer && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md px-5 pb-5">
          <Button
            href="/login"
            className="pointer-events-auto w-full shadow-[0_0_30px_var(--accent-soft)]"
          >
            Regístrate para seguirle →
          </Button>
        </div>
      )}
    </div>
  );
}

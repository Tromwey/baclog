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
import { getRenderInstant } from "@/modules/catalog/release";
import { ShareChip } from "@/app/u/share-chip";
import {
  BackChip,
  CollectionCard,
  CountRibbon,
  Cover,
  CreditsLink,
  HONEY_BUTTON,
  Mono,
  PublicCta,
  Seal,
  SectionTitle,
  Wordmark,
} from "@/app/u/kura/components";
import { releaseLabel, tintSurface } from "@/app/u/kura/tint";
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

/**
 * Kura · 33a perfil público (design/kura/sistema-de-diseno.dc.html §marca ·
 * cabeceras · perfil): a surface tinted by the owner's dominant palette,
 * fused into the page; Volver and Compartir at 64/24; the seal (or photo) at
 * 128; the name in Newsreader 40; the ribbon of counts, one per state; and
 * Seguir in honey — the only accent on the screen. Below, the automatic
 * "no puedo esperar" card when there is something coming, then their
 * collections as cards with a spine, then what they wrote.
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
  // The tint comes from the covers of what they keep (public.ts already
  // aggregates the dominant hexes); the lima fallback of the old aura is not
  // a colour Kura has, so a paletteless profile is simply `--bg`.
  const palette = profile.palette.filter((h) => h.toLowerCase() !== "#d8ff3e");
  const collectionCount = profile.backlogs.length;

  return (
    <div className={`kura relative mx-auto min-h-dvh w-full max-w-md overflow-x-clip bg-bg text-text ${viewer ? "pb-16" : "pb-[170px]"}`}>
      {/* Cabecera de persona */}
      <header
        className="relative flex flex-col items-center gap-3 px-6 pb-8 pt-[calc(124px+env(safe-area-inset-top))]"
        style={{ background: tintSurface(palette) }}
      >
        <div className="absolute inset-x-6 top-[calc(64px+env(safe-area-inset-top))] flex items-center justify-between">
          {viewer ? <BackChip href="/backlogs" /> : <Wordmark size={26} />}
          <ShareChip
            path={`/u/${profile.username}`}
            label={`Compartir el perfil de ${profile.displayName}`}
            className="h-11! w-11!"
          />
        </div>

        <Seal name={profile.displayName || profile.username} hexes={palette} src={profile.avatarUrl} size={128} className="shadow-cover" />
        {/* overflow-wrap: a 50-char display name (or one long token) must
            wrap inside the column, not run off the screen. */}
        <h1 className="mt-2 text-center font-brand text-[40px] leading-none text-text text-balance [overflow-wrap:anywhere]">
          {profile.displayName}
        </h1>
        <Mono upper={false}>
          @{profile.username}
          {profile.isFounder && " · fundador"}
        </Mono>

        <CountRibbon
          className="mt-1"
          counts={[
            { kind: "obsessed", n: counts.obsessed, label: "le obsesionan" },
            { kind: "liked", n: counts.liked, label: "le gustan" },
            { kind: "completed", n: counts.completed, label: "completos" },
            { kind: "users", n: profile.followerCount, label: plural(profile.followerCount, "seguidor", "seguidores") },
          ]}
        />

        {!isOwner && (
          <div className="mt-2 flex flex-col items-center gap-2.5">
            {viewer ? (
              <FollowButton
                username={profile.username}
                initialFollowing={viewerFollows}
                variant="kura"
              />
            ) : (
              // Anonymous: the same honey pill leads into the account flow
              // (§patrones · links y cuenta: the action completes itself once
              // the registration ends — today it lands on /login).
              <Link href="/login" className={HONEY_BUTTON}>
                Seguir
              </Link>
            )}
            {affinityLine && (
              <span className="text-center text-[13px] leading-[1.4] text-text-2">{affinityLine}</span>
            )}
          </div>
        )}
      </header>

      <main className="relative flex flex-col gap-8 px-3 pt-2">
        {/* La automática — what they are waiting for, as Kura's own card.
            Third person: the visitor reads someone else's anticipation. */}
        {profile.upcoming.length > 0 && (
          <CollectionCard
            name="no puedo esperar"
            tag="auto"
            height={120}
            paletteHex={profile.upcoming.find((u) => u.paletteHex?.length)?.paletteHex ?? []}
            covers={profile.upcoming.map((u) => ({
              posterUrl: u.posterUrl,
              paletteHex: u.paletteHex,
              mediaType: u.mediaType,
              title: u.title,
              wait: releaseLabel(u.releaseDate, now),
            }))}
          />
        )}

        {/* En común contigo — signed-in only, and only titles the owner keeps
            on a public collection (affinity.ts). */}
        {affinity && affinity.common.length > 0 && (
          <section className="flex flex-col gap-3 px-3">
            <SectionTitle aside={`${affinity.common.length}`}>en común contigo</SectionTitle>
            <div className="bl-scroll -mx-3 flex items-end gap-3 overflow-x-auto px-3 pb-6">
              {affinity.common.map((it) => (
                <Link key={it.catalogItemId} href={itemHref(it.catalogItemId)} className="flex w-[100px] flex-none flex-col gap-[7px] bl-press-lg">
                  <Cover posterUrl={it.posterUrl} paletteHex={it.paletteHex} mediaType={it.mediaType} alt={it.title} className="w-[100px]" />
                  <span className="truncate font-brand text-[14px] italic leading-[1.15] text-text">{it.title}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Sus colecciones — the escaparate (F3.10.1: public AND on the
            profile), each the collection card: spine + covers at 120. */}
        {collectionCount > 0 && (
          <section className="flex flex-col gap-3">
            <div className="px-3">
              <SectionTitle aside={`${collectionCount} ${plural(collectionCount, "colección", "colecciones")}`}>
                sus colecciones
              </SectionTitle>
            </div>
            <div className="flex flex-col gap-3">
              {profile.backlogs.map((b) => (
                <CollectionCard
                  key={b.id}
                  name={b.name}
                  href={`/u/${profile.username}/${b.id}`}
                  height={120}
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

        {/* F3.9 — "Lo que dice X". Renders nothing until they've written one. */}
        <div className="-mx-3">
          <ProfileReviews
            username={profile.username}
            displayName={profile.displayName}
            reviews={reviews}
          />
        </div>

        <div className="flex flex-col items-center gap-4 pt-2">
          <ReportButton username={profile.username} />
          <CreditsLink />
        </div>
      </main>

      {!viewer && (
        <PublicCta note="Guarda lo que más vale y mira lo que obsesiona a tu gente." />
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

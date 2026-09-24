import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/auth";
import { getPublicBacklog, getPublicProfile } from "@/modules/backlog/public";
import { getRenderInstant, isUpcoming } from "@/modules/catalog/release";
import { isFollowing } from "@/modules/social/queries";
import { FollowButton } from "@/components/follow-button";
import { captureView } from "@/modules/analytics/capture";
import { plural } from "@/lib/plural";
import {
  BrandLockup,
  Cover,
  CreditsLink,
  CtaCard,
  EnterPill,
  Seal,
  stateGlyph,
} from "@/components/kura/components";
import { releaseLabel, tintSurfaceVertical } from "@/components/kura/tint";
import { CollectionBody, type ShelfItem } from "./collection-body";

// Dynamic on purpose (see u/[username]/page.tsx) — F3.4 viewer analytics.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string; backlogId: string }>;
}): Promise<Metadata> {
  const { username, backlogId } = await params;
  const data = await getPublicBacklog(username, backlogId);
  if (!data) return {};
  const firstPoster = data.items.find((i) => i.posterUrl)?.posterUrl;
  return {
    title: `${data.backlogName} · ${data.ownerName} · kura`,
    description: `${data.items.length} ${plural(data.items.length, "título", "títulos")} de ${data.ownerName}.`,
    openGraph: {
      title: data.backlogName,
      description: `Una colección de ${data.ownerName} en kura.`,
      ...(firstPoster ? { images: [firstPoster] } : {}),
    },
  };
}

/**
 * Kura · 33b colección compartida web (design/kura/flujos-v2.dc.html, flujo
 * 12): the header tinted by the collection's covers and fused into the page,
 * the brand lockup and the way in at 64, the lead cover at 240, the name in
 * Newsreader 24, the owner row (seal 32 · "de @handle" · Seguir), the format
 * pills that filter, then the shelf — grouped by format when each has three
 * or more — and the CTA card at the end.
 */
export default async function PublicBacklogPage({
  params,
}: {
  params: Promise<{ username: string; backlogId: string }>;
}) {
  const { username, backlogId } = await params;
  const [data, owner, viewer] = await Promise.all([
    getPublicBacklog(username, backlogId),
    // For the seal's colours and photo; the same gate as the collection.
    getPublicProfile(username),
    getCurrentUser(),
  ]);
  if (!data || !owner) notFound();

  const now = await getRenderInstant();
  const isOwner = viewer?.username === username;
  const viewerFollows = viewer && !isOwner ? await isFollowing(viewer.id, username) : false;

  captureView({
    eventType: "public_backlog_view",
    targetUsername: username,
    headers: await headers(),
  });

  const lead = data.items.find((i) => i.posterUrl) ?? data.items[0];
  const count = data.items.length;
  const items: ShelfItem[] = data.items.map((i) => {
    const upcoming = isUpcoming(i.releaseDate, now);
    return {
      catalogItemId: i.catalogItemId,
      title: i.title,
      mediaType: i.mediaType,
      posterUrl: i.posterUrl,
      paletteHex: i.paletteHex ?? null,
      glyph: stateGlyph({ obsessed: i.obsessed, status: i.status, verdict: i.verdict }),
      wait: upcoming && i.releaseDate ? releaseLabel(i.releaseDate, now) : null,
    };
  });
  const ownerPalette = owner.palette.filter((h) => h.toLowerCase() !== "#d8ff3e");

  return (
    <div className="kura relative mx-auto min-h-dvh w-full max-w-md overflow-x-clip bg-bg text-text">
      <header
        className="relative flex flex-col items-center gap-3 px-6 pb-7 pt-[calc(124px+env(safe-area-inset-top))]"
        style={{ background: tintSurfaceVertical(data.palette) }}
      >
        <div className="absolute inset-x-6 top-[calc(64px+env(safe-area-inset-top))] flex items-center justify-between">
          <BrandLockup />
          {viewer ? (
            <Link
              href="/backlogs"
              className="inline-flex h-11 items-center rounded-full bg-[var(--glass-bg)] px-[18px] font-sans text-[15px] font-semibold text-text bl-press hover:bg-white/[0.12]"
            >
              Mis colecciones
            </Link>
          ) : (
            <EnterPill />
          )}
        </div>

        {lead ? (
          <Cover
            posterUrl={lead.posterUrl}
            paletteHex={lead.paletteHex}
            mediaType={lead.mediaType}
            alt={lead.title}
            className="h-[240px]"
            style={{ width: lead.mediaType === "album" ? 240 : 160 }}
          />
        ) : (
          <span className="flex h-[240px] w-[160px] items-center justify-center rounded-[var(--r-cover-l)] bg-[var(--glass-bg)] text-text-2">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
          </span>
        )}
        <h1 className="mt-2 text-center font-brand text-[24px] leading-[1.05] text-text text-balance [overflow-wrap:anywhere]">
          {data.backlogName}
        </h1>

        {/* The owner row: seal · "de @handle" · Seguir (33b). */}
        <div className="mt-1 flex items-center gap-2.5">
          <Link href={`/u/${username}`} className="flex items-center gap-2.5 bl-press-lg">
            <Seal name={owner.displayName || username} hexes={ownerPalette} src={owner.avatarUrl} size={32} />
            <span className="text-[15px] text-text-2">
              de <b className="font-semibold text-text">@{username}</b>
            </span>
          </Link>
          {!isOwner &&
            (viewer ? (
              <FollowButton username={username} initialFollowing={viewerFollows} variant="kura" className="h-9! px-3.5! text-[14px]!" />
            ) : (
              <Link
                href="/login"
                className="inline-flex h-9 items-center rounded-full bg-honey px-3.5 font-sans text-[14px] font-semibold text-bg bl-press active:bg-honey-press"
              >
                Seguir
              </Link>
            ))}
        </div>
        {data.vibe && (
          <p className="max-w-[30ch] text-center text-[15px] leading-[1.5] text-text-2 text-pretty">{data.vibe}</p>
        )}
      </header>

      <main className="flex flex-col gap-8 pb-14 pt-4">
        {count > 0 ? (
          <CollectionBody items={items} username={username} backlogId={backlogId} />
        ) : (
          // The read-only twin of 15d (colección vacía): the visitor isn't
          // the owner, so no "Agregar títulos".
          <div className="flex flex-col items-center gap-3 px-8 pt-4 text-center">
            <p className="font-brand text-[32px] leading-[1.05] text-text text-balance">colección nueva, repisa vacía.</p>
            <p className="max-w-[30ch] text-[15px] leading-[1.5] text-text-2">Todavía no hay títulos aquí.</p>
          </div>
        )}

        {!viewer && <CtaCard className="mx-5" />}
        <CreditsLink />
      </main>
    </div>
  );
}

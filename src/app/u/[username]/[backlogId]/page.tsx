import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/auth";
import { assertOwnsBacklog } from "@/authz";
import { getPublicBacklog, getPublicProfile } from "@/modules/backlog/public";
import { getRenderInstant, isUpcoming } from "@/modules/catalog/release";
import { byManualOrder, fanHexes, fanOf, formatsLine, joinNames } from "@/modules/backlog/fan";
import { captureView } from "@/modules/analytics/capture";
import { plural } from "@/lib/plural";
import { ShareChip } from "@/app/u/share-chip";
import {
  BrandLockup,
  CreditsLink,
  EnterPill,
  Seal,
  stateGlyph,
} from "@/components/kura/components";
import { Fan } from "@/components/kura/fan";
import { Masonry, type MasonryItem } from "@/components/kura/masonry";
import { subFor } from "@/components/kura/masonry-data";
import { feedSurface, feedTail, releaseLabel } from "@/components/kura/tint";
import { visibilityOf } from "@/modules/backlog/visibility";
import { OwnerOptions } from "./owner-options";
import { SaveCopyButton } from "./save-copy-button";

// Dynamic on purpose (see u/[username]/page.tsx) — F3.4 viewer analytics.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string; backlogId: string }>;
}): Promise<Metadata> {
  const { username, backlogId } = await params;
  const data = await getPublicBacklog(username, backlogId);
  if (!data) return {};
  // The fan's front cover first (the owner's choice), else any cover.
  const ordered = [...data.items].sort(byManualOrder);
  const firstPoster =
    fanOf(ordered, data.coverCatalogItemId).find((i) => i.posterUrl)?.posterUrl ??
    ordered.find((i) => i.posterUrl)?.posterUrl;
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
 * Colección compartida (Colecciones formalizado · 4a, 2026-09-27 — was 33b):
 * what arrives by the link. The whole page in the feed gradient of the
 * collection's fan; the brand lockup and the way in at 64; the fan at 225;
 * the owner's seal and "una colección de @sofi"; the name in Newsreader 36,
 * the line in italic, "12 títulos · cine, series, música"; then the ONE honey
 * of the screen — "Guárdala en kura" — beside a glass Compartir; the titles
 * in columns in the owner's manual order; and, for someone without an
 * account, the "arma la tuya." card.
 *
 * "Guárdala en kura": anonymous → the account flow; signed in → a private
 * copy in their own library (SaveCopyButton); the owner → their own
 * collection, in glass (the honey is for the visitor).
 *
 * The owner also gets a glass Opciones next to Compartir (9c) that opens 9a
 * — the same sheet as holding the fan in Tus colecciones. Its facts (pin,
 * visibility) come from `assertOwnsBacklog`, the owner-scoped read the
 * actions use; a visitor never triggers it.
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
  // 9c: the owner's own row (pin, visibility). Scoped to the session by the
  // assert itself; anything but the owner gets null and no Opciones.
  const own = isOwner ? await assertOwnsBacklog(backlogId).catch(() => null) : null;

  captureView({
    eventType: "public_backlog_view",
    targetUsername: username,
    headers: await headers(),
  });

  const ordered = [...data.items].sort(byManualOrder);
  const fan = fanOf(ordered, data.coverCatalogItemId);
  const hexes = fanHexes(fan, ordered);
  const count = ordered.length;
  const items: MasonryItem[] = ordered.map((i) => {
    const upcoming = isUpcoming(i.releaseDate, now);
    return {
      key: i.catalogItemId,
      // ?from carries the origin collection so the item page's back returns
      // HERE, not to the profile.
      href: `/u/${username}/item/${i.catalogItemId}?from=${backlogId}`,
      title: i.title,
      mediaType: i.mediaType,
      posterUrl: i.posterUrl,
      paletteHex: i.paletteHex ?? null,
      glyph: stateGlyph({ obsessed: i.obsessed, status: i.status, verdict: i.verdict }),
      wait: upcoming && i.releaseDate ? releaseLabel(i.releaseDate, now) : null,
      sub: subFor(i),
    };
  });
  const ownerPalette = owner.palette.filter((h) => h.toLowerCase() !== "#d8ff3e");
  const by = joinNames([`@${username}`, ...data.collaborators.flatMap((c) => (c.username ? [`@${c.username}`] : []))]);
  const kinds = formatsLine([...new Set(ordered.map((i) => i.mediaType))]);

  return (
    <div
      className="kura relative mx-auto min-h-dvh w-full max-w-md overflow-x-clip text-text"
      style={{ background: feedSurface(hexes, 900), backgroundColor: feedTail(hexes) }}
    >
      <div className="flex items-center justify-between px-6 pt-[calc(64px+env(safe-area-inset-top))]">
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

      <header className="flex flex-col items-center gap-2.5 px-6 pb-[26px] pt-[22px] text-center">
        <Fan covers={fan} lead={225} ghost={count === 0} label={`Portadas de ${data.backlogName}`} />

        <Link href={`/u/${username}`} className="mt-1 flex items-center gap-2 bl-press-lg">
          <Seal name={owner.displayName || username} hexes={ownerPalette} src={owner.avatarUrl} size={24} />
          <span className="text-[13px] text-text-2">
            una colección de <b className="font-semibold text-text">{by}</b>
          </span>
        </Link>
        <h1 className="font-brand text-[36px] font-normal leading-none text-text [overflow-wrap:anywhere] [text-wrap:balance]">
          {data.backlogName}
        </h1>
        {data.vibe && (
          <span className="max-w-[32ch] font-brand text-[16px] italic leading-[1.3] text-text-2 [text-wrap:pretty]">
            {data.vibe}
          </span>
        )}
        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">
          {count} {plural(count, "título", "títulos")}
          {kinds && ` · ${kinds}`}
        </span>

        <div className="mt-2.5 flex items-start gap-2">
          {isOwner ? (
            <Link
              href={`/backlogs/${backlogId}`}
              className="inline-flex h-12 items-center rounded-full bg-[var(--glass-bg)] px-6 font-sans text-[16px] font-semibold text-text bl-press hover:bg-white/[0.12]"
            >
              Abrir en tus colecciones
            </Link>
          ) : viewer ? (
            <SaveCopyButton username={username} backlogId={backlogId} />
          ) : (
            <Link
              href="/login"
              className="inline-flex h-12 items-center rounded-full bg-honey px-6 font-sans text-[16px] font-semibold text-bg bl-press active:bg-honey-press"
            >
              Guárdala en kura
            </Link>
          )}
          <ShareChip
            path={`/u/${username}/${backlogId}`}
            label={`Compartir ${data.backlogName}`}
            className="h-11! w-11!"
          />
          {own && (
            <OwnerOptions
              collection={{
                id: own.backlog.id,
                name: own.backlog.name,
                vibe: own.backlog.vibe,
                count,
                pinned: own.backlog.pinnedAt !== null,
                visibility: visibilityOf(own.backlog),
              }}
              username={own.user.username}
              profilePublic={own.user.isPublic}
            />
          )}
        </div>
      </header>

      <main className="flex flex-col gap-8 pb-14">
        {count > 0 ? (
          <Masonry items={items} />
        ) : (
          // The read-only twin of 6b (colección vacía): the visitor isn't
          // the owner, so no "Agregar títulos".
          <div className="flex flex-col items-center gap-3 px-8 text-center">
            <p className="font-brand text-[28px] leading-[1.1] text-text text-balance">colección nueva, repisa vacía.</p>
            <p className="max-w-[30ch] text-[15px] leading-[1.5] text-text-2">Todavía no hay títulos aquí.</p>
          </div>
        )}

        {!viewer && (
          <div className="mx-5 flex flex-col gap-2 rounded-[var(--r-screen)] bg-white/[0.05] p-[22px]">
            <span className="font-brand text-[24px] leading-[1.1] text-text">arma la tuya.</span>
            <span className="text-[14px] leading-[1.5] text-text-2">
              Películas, series y música en colecciones que se comparten como tarjeta.
            </span>
          </div>
        )}
        <CreditsLink />
      </main>
    </div>
  );
}

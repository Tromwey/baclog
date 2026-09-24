import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getPublicBacklog } from "@/modules/backlog/public";
import { getRenderInstant, isUpcoming } from "@/modules/catalog/release";
import type { MediaType } from "@/modules/catalog/types";
import { captureView } from "@/modules/analytics/capture";
import { plural } from "@/lib/plural";
import { ShareChip } from "@/app/u/share-chip";
import {
  BackChip,
  Cover,
  CreditsLink,
  Mono,
  PublicCta,
  stateGlyph,
} from "@/app/u/kura/components";
import { releaseLabel, tintSurface } from "@/app/u/kura/tint";
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

/** The mock's kind label under a cover: "Cine · 2001". */
const KIND: Record<MediaType, string> = { film: "Cine", series: "Serie", album: "Álbum" };

/**
 * Kura · 33b colección compartida (flujos-v2 · 03 "Colección" + 23a): the
 * header tinted by the collection's covers, fused into the page; Volver (to
 * the owner's profile) and Compartir at 64/24; the lead cover centred at 240
 * high; the name in Newsreader 24; the owner and count in mono; then the
 * format pills that filter, and the shelf. Anonymous visitors get the solid
 * "Crear cuenta" over the fade.
 */
export default async function PublicBacklogPage({
  params,
}: {
  params: Promise<{ username: string; backlogId: string }>;
}) {
  const { username, backlogId } = await params;
  const data = await getPublicBacklog(username, backlogId);
  if (!data) notFound();

  const now = await getRenderInstant();

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
      sub: [KIND[i.mediaType], upcoming ? null : i.year].filter(Boolean).join(" · "),
      mediaType: i.mediaType,
      posterUrl: i.posterUrl,
      paletteHex: i.paletteHex ?? null,
      glyph: stateGlyph({ obsessed: i.obsessed, status: i.status, verdict: i.verdict }),
      wait: upcoming && i.releaseDate ? releaseLabel(i.releaseDate, now) : null,
    };
  });

  return (
    <div className="kura relative mx-auto min-h-dvh w-full max-w-md overflow-x-clip bg-bg pb-[170px] text-text">
      <header
        className="relative flex flex-col items-center gap-3 px-6 pb-7 pt-[calc(124px+env(safe-area-inset-top))]"
        style={{ background: tintSurface(data.palette) }}
      >
        <div className="absolute inset-x-6 top-[calc(64px+env(safe-area-inset-top))] flex items-center justify-between">
          <BackChip href={`/u/${username}`} label={`Ver el perfil de ${data.ownerName ?? username}`} />
          <ShareChip path={`/u/${username}/${backlogId}`} label={`Compartir ${data.backlogName}`} className="h-11! w-11!" />
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
          <span className="flex h-[240px] w-[160px] items-center justify-center rounded-[var(--r-cover-l)] bg-[var(--glass-bg)]">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
          </span>
        )}
        <h1 className="mt-2 text-center font-brand text-[24px] leading-[1.05] text-text text-balance [overflow-wrap:anywhere]">
          {data.backlogName}
        </h1>
        <Mono upper={false}>
          de @{username} · {count} {plural(count, "título", "títulos")}
        </Mono>
        {data.vibe && (
          <p className="max-w-[30ch] text-center text-[15px] leading-[1.5] text-text-2 text-pretty">{data.vibe}</p>
        )}
      </header>

      <main className="relative">
        {count > 0 ? (
          <CollectionBody items={items} username={username} backlogId={backlogId} />
        ) : (
          // The read-only twin of 15d (colección vacía): the visitor isn't
          // the owner, so no "Agregar títulos" — the fixed CTA below invites
          // them to start their own.
          <div className="flex flex-col items-center gap-3 px-8 pt-8 text-center">
            <p className="font-brand text-[32px] leading-[1.05] text-text text-balance">
              colección nueva, repisa vacía.
            </p>
            <p className="max-w-[30ch] text-[15px] leading-[1.5] text-text-2">
              Todavía no hay títulos aquí.
            </p>
          </div>
        )}
        <CreditsLink className="pt-12" />
      </main>

      <PublicCta note="Guarda lo que más vale: películas, series y música, en colecciones." />
    </div>
  );
}

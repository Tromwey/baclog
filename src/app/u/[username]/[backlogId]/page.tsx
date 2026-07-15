import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Music, Play } from "lucide-react";
import { getPublicBacklog } from "@/modules/backlog/public";
import { captureView } from "@/modules/analytics/capture";
import { parseHex } from "@/lib/color";
import { BacklogHero } from "@/components/backlog-hero";
import { ItemStatus } from "@/components/item-status";
import { BackButton, Button, MonoMeta } from "@/components/ui";
import { FLAME_PATH, GLYPH_VIEWBOX } from "@/components/glyph-paths";
import { shelfSeed } from "@/app/(app)/backlogs/backlog-shelf-card";

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
    title: `${data.backlogName} · ${data.ownerName} · Baclog`,
    description: `${data.items.length} obsesiones de ${data.ownerName}.`,
    openGraph: {
      title: data.backlogName,
      description: `Un backlog de ${data.ownerName} en Baclog.`,
      ...(firstPoster ? { images: [firstPoster] } : {}),
    },
  };
}

export default async function PublicBacklogPage({
  params,
}: {
  params: Promise<{ username: string; backlogId: string }>;
}) {
  const { username, backlogId } = await params;
  const data = await getPublicBacklog(username, backlogId);
  if (!data) notFound();

  captureView({
    eventType: "public_backlog_view",
    targetUsername: username,
    headers: await headers(),
  });

  return (
    <div className="relative mx-auto min-h-dvh w-full max-w-md overflow-hidden bg-bg text-text">
      {/* Shared hero (B disciplinada) — the SAME component the in-app zoom view
          renders, so the two backlog-detail twins can't drift. The public
          top-bar control is the ‹ @username link back to the owner's profile. */}
      <BacklogHero
        name={data.backlogName}
        vibe={data.vibe}
        itemCount={data.items.length}
        year={data.createdAt.getFullYear()}
        palette={data.palette}
        seed={shelfSeed(backlogId)}
        controls={<BackButton href={`/u/${username}`} />}
      />

      <main className="relative px-5 pb-32 pt-[18px]">
        {data.items.length > 0 ? (
          <div className="space-y-2">
            {data.items.map((item) => {
              // Per-item palette wash (left): the cover's dominant hue bleeds
              // from the left edge and fades to the card fill by ~60%. parseHex
              // → rgba (same technique as the item page's coverShadow), fading to
              // the SAME colour at alpha 0 (never `transparent`) so there's no
              // dark fringe (aura-field rule). Card stays borderless (§7).
              const wash = item.paletteHex?.[0]
                ? parseHex(item.paletteHex[0])
                : null;
              const leftWash = wash
                ? `linear-gradient(90deg, rgba(${wash.r},${wash.g},${wash.b},0.34) 0%, rgba(${wash.r},${wash.g},${wash.b},0) 60%)`
                : null;
              const isAlbum = item.mediaType === "album";
              return (
                <Link
                  key={item.id}
                  // ?from carries the origin backlog so the item page's back
                  // returns HERE, not to the profile. Deep-linked/shared item
                  // URLs omit it and fall back to the profile.
                  href={`/u/${username}/item/${item.catalogItemId}?from=${backlogId}`}
                  className="relative flex items-center gap-3 overflow-hidden rounded-[var(--r-md)] bg-surface-1 p-2.5 transition-colors hover:bg-surface-2"
                >
                  {leftWash && (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-0"
                      style={{ background: leftWash }}
                    />
                  )}
                  {/* Obsession (B disciplinada): a CONTAINED radial hot aura
                      pooling AROUND the flame at the right edge — the glyph is
                      the ember throwing the light (§7: the aura is the only light
                      source). A glow, not a full bloom, so it never fights the
                      hero aura. */}
                  {item.obsessed && (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-0"
                      style={{
                        background:
                          "radial-gradient(circle at 100% 50%, rgba(255,45,85,0.34) 0%, rgba(255,45,85,0) 60%)",
                      }}
                    />
                  )}
                  {/* Native-aspect thumbnail — album 1:1, film/series 2:3 (never
                      cross-crop) — centred in a fixed 56px slot so every title's
                      text starts at the same x; the side gap for a tall poster
                      shows the wash, not black. */}
                  <div className="relative flex h-14 w-14 shrink-0 items-center justify-center">
                    {item.posterUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- hotlinked external CDN (ADR-007)
                      <img
                        src={item.posterUrl}
                        alt=""
                        loading="lazy"
                        className={`rounded-[var(--r-sm)] object-cover ${isAlbum ? "h-14 w-14" : "h-14 w-[37px]"}`}
                      />
                    ) : (
                      <div
                        className={`flex items-center justify-center rounded-[var(--r-sm)] bg-surface-3 text-text-3 ${isAlbum ? "h-14 w-14" : "h-14 w-[37px]"}`}
                      >
                        {isAlbum ? <Music size={18} /> : <Play size={18} />}
                      </div>
                    )}
                  </div>
                  <div className="relative min-w-0 flex-1">
                    <p className="truncate font-serif text-lg italic leading-tight text-text">
                      {item.title}
                    </p>
                    <MonoMeta className="mt-0.5 block text-[10px] normal-case tracking-normal text-text-2">
                      {[item.byline, item.year].filter(Boolean).join(" · ")}
                    </MonoMeta>
                    <span className="mt-1.5 block">
                      {/* Public caption — status dot + Spanish label + public
                          reaction. hideProvenance: the ✦ provenance glyph NEVER
                          appears publicly (the atom owns that rule). */}
                      <ItemStatus
                        mode="caption"
                        status={item.status}
                        // The public query types verdict as sql<string | null>
                        // (gated to completed items); narrow to the atom's union.
                        verdict={
                          item.verdict as "disliked" | "liked" | null
                        }
                        obsessed={item.obsessed}
                        sourceCrossMediaRecId={null}
                        hideProvenance
                      />
                    </span>
                  </div>
                  {/* Obsession signal: a prominent flame at the source of its
                      own right-edge hot wash. No caption word (flame + wash
                      carry it, like "en el radar" the label is redundant);
                      off-white so it reads on the red wash — with no hot caption
                      word left to be inconsistent with. */}
                  {item.obsessed && (
                    // Comfortable trailing inset (~16px total with the card's
                    // p-2.5) so the lone flame doesn't look glued to the edge —
                    // still edge-anchored to its own right-edge glow, not pulled
                    // to the vertical centre (that would detach it from the wash).
                    <span aria-hidden className="relative flex-none pr-1.5">
                      <svg
                        width="18"
                        height="18"
                        viewBox={GLYPH_VIEWBOX}
                        fill="#F4F3EE"
                        aria-hidden
                      >
                        <path d={FLAME_PATH} />
                      </svg>
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ) : (
          // Estante en blanco, read-only twin of backlog-zoom-view's empty
          // state (mock #p7): the viewer isn't the owner, so no "Agregar
          // algo" CTA — the fixed login button below already invites them to
          // start their own. Dashed tile is a deliberate §7 exception.
          <div className="mt-10 flex flex-col items-center text-center">
            <div className="flex h-[88px] w-[88px] items-center justify-center rounded-[22px] border-[1.5px] border-dashed border-[#33333C]">
              <svg
                width="30"
                height="30"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden
              >
                <path
                  d="M12 5v14M5 12h14"
                  stroke="#4A4A54"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <p className="mt-[22px] font-serif text-[26px] italic leading-[1.2]">
              Este backlog está vacío.
            </p>
            <p className="mt-3 max-w-[30ch] text-sm leading-[1.55] text-text-2">
              Todavía no hay títulos aquí.
            </p>
          </div>
        )}

        {/* This list page has no per-item watch button to attribute JustWatch
            next to — that note lives on each item's own page instead. General
            TMDB/Apple Music attribution centralizes at /creditos (TMDB's own
            FAQ allows this in an About/Credits section). */}
        <footer className="mt-10 text-center">
          <MonoMeta className="text-[10px] text-text-3">
            <Link href="/creditos" className="underline">
              Créditos
            </Link>
          </MonoMeta>
        </footer>
      </main>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md px-5 pb-5">
        <Button
          href="/login"
          className="pointer-events-auto w-full shadow-[0_0_30px_var(--accent-soft)]"
        >
          Empieza tu backlog →
        </Button>
      </div>
    </div>
  );
}

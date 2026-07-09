import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Music, Play } from "lucide-react";
import { getPublicBacklog } from "@/modules/backlog/public";
import { captureView } from "@/modules/analytics/capture";
import { plural } from "@/lib/plural";
import { AuraBackdrop, Button, MonoMeta } from "@/components/ui";
import type { ChipTone } from "@/components/ui";

// Dynamic on purpose (see u/[username]/page.tsx) — F3.4 viewer analytics.

const STATUS_LABEL: Record<string, string> = {
  on_my_radar: "On my radar",
  obsessing_over: "Obsessing over",
  completed: "Completed",
};
const STATUS_TONE: Record<string, ChipTone> = {
  on_my_radar: "radar",
  obsessing_over: "obsessing",
  completed: "completed",
};
const TONE_DOT: Record<ChipTone, string> = {
  radar: "bg-radar",
  obsessing: "bg-obsessing",
  completed: "bg-completed",
  neutral: "bg-text-3",
};

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
      <AuraBackdrop height="240px" />

      <main className="relative px-5 pb-32 pt-8">
        <header className="bl-rise">
          <Link
            href={`/u/${username}`}
            className="inline-flex items-center gap-1 font-mono text-xs uppercase tracking-[0.08em] text-text-2 transition-colors hover:text-text"
          >
            <ChevronLeft size={14} /> @{data.ownerUsername}
          </Link>
          <h1 className="mt-3 font-display text-3xl font-bold leading-[1.05] tracking-[-0.01em]">
            {data.backlogName}
          </h1>
          <MonoMeta className="mt-2 block">
            {data.items.length} {plural(data.items.length, "ítem", "ítems")}
            {data.vibe ? ` · ${data.vibe}` : ""}
          </MonoMeta>
        </header>

        <div className="mt-6 space-y-2">
          {data.items.map((item) => {
            const tone: ChipTone =
              item.status === "custom"
                ? "neutral"
                : STATUS_TONE[item.status] ?? "neutral";
            const label =
              item.status === "custom"
                ? item.customStatusLabel
                : STATUS_LABEL[item.status];
            return (
              <Link
                key={item.id}
                href={`/u/${username}/item/${item.catalogItemId}`}
                className="flex items-center gap-3 rounded-[var(--r-md)] border border-line bg-surface-1 p-2.5 transition-colors hover:bg-surface-2"
              >
                {item.posterUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- hotlinked external CDN (ADR-007)
                  <img
                    src={item.posterUrl}
                    alt=""
                    className="h-16 w-12 shrink-0 rounded-[var(--r-sm)] object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-16 w-12 shrink-0 items-center justify-center rounded-[var(--r-sm)] bg-surface-3 text-text-3">
                    {item.mediaType === "album" ? (
                      <Music size={18} />
                    ) : (
                      <Play size={18} />
                    )}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-serif text-lg italic leading-tight text-text">
                    {item.title}
                  </p>
                  <MonoMeta className="mt-0.5 block text-[10px] normal-case tracking-normal text-text-2">
                    {[item.byline, item.year].filter(Boolean).join(" · ")}
                  </MonoMeta>
                  <span className="mt-1.5 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-text-2">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[tone]}`}
                    />
                    {label}
                    {item.rating ? ` · ${"★".repeat(item.rating)}` : ""}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>

        <footer className="mt-10 text-center">
          <MonoMeta className="text-[10px] text-text-3">
            Datos e imágenes de TMDB y Apple Music · Disponibilidad por JustWatch
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

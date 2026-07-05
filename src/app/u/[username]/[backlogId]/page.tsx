import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicBacklog } from "@/modules/backlog/public";

export const revalidate = 300;

const STATUS_LABEL: Record<string, string> = {
  on_my_radar: "On my radar",
  obsessing_over: "Obsessing over",
  completed: "Completed",
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

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md bg-neutral-950 px-4 pb-20 pt-8 text-neutral-100">
      <header>
        <Link
          href={`/u/${username}`}
          className="text-sm text-neutral-400 hover:text-neutral-200"
        >
          ← @{data.ownerUsername}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{data.backlogName}</h1>
        <p className="text-sm text-neutral-500">
          {data.items.length} {data.items.length === 1 ? "ítem" : "ítems"}
          {data.vibe ? ` · ${data.vibe}` : ""}
        </p>
      </header>

      <div className="mt-5 space-y-2">
        {data.items.map((item) => (
          <Link
            key={item.id}
            href={`/u/${username}/item/${item.catalogItemId}`}
            className="flex items-center gap-3 rounded-xl bg-neutral-900 p-2.5 hover:bg-neutral-800"
          >
            {item.posterUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- hotlinked external CDN (ADR-007)
              <img
                src={item.posterUrl}
                alt=""
                className="h-16 w-12 rounded-md object-cover"
                loading="lazy"
              />
            ) : (
              <div className="flex h-16 w-12 items-center justify-center rounded-md bg-neutral-800">
                {item.mediaType === "album" ? "♫" : "▶"}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate font-medium">{item.title}</p>
              <p className="truncate text-xs text-neutral-500">
                {[item.byline, item.year].filter(Boolean).join(" · ")}
              </p>
              <p className="mt-1 text-[11px] font-semibold text-neutral-400">
                {item.status === "custom"
                  ? item.customStatusLabel
                  : STATUS_LABEL[item.status]}
                {item.rating ? ` · ${"★".repeat(item.rating)}` : ""}
              </p>
            </div>
          </Link>
        ))}
      </div>

      <footer className="mt-12 text-center">
        <Link
          href="/login"
          className="inline-block rounded-full bg-neutral-100 px-6 py-3 font-semibold text-neutral-900"
        >
          Crea tu Baclog
        </Link>
        <p className="mt-6 text-[11px] text-neutral-600">
          Datos e imágenes de TMDB y Apple Music · Disponibilidad por JustWatch
        </p>
      </footer>
    </main>
  );
}

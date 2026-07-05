import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { getBacklogsForUser } from "@/modules/backlog/queries";
import { getCatalogItem } from "@/modules/catalog/cache";
import { AddToBacklog } from "./add-to-backlog";
import { Attribution } from "./attribution";

const TYPE_LABEL: Record<string, string> = {
  film: "Película",
  series: "Serie",
  album: "Álbum",
};

export default async function ItemPage({
  params,
}: {
  params: Promise<{ catalogItemId: string }>;
}) {
  const user = await requireUser();
  const { catalogItemId } = await params;
  const [item, userBacklogs] = await Promise.all([
    getCatalogItem(catalogItemId),
    getBacklogsForUser(user.id),
  ]);
  if (!item) notFound();

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md bg-neutral-950 px-4 pb-16 pt-6 text-neutral-100">
      <div className="flex gap-4">
        {item.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- hotlinked external CDN (ADR-007: never proxy)
          <img
            src={item.posterUrl}
            alt={`Portada de ${item.title}`}
            className="h-44 w-30 shrink-0 rounded-xl object-cover shadow-lg"
          />
        ) : (
          <div className="flex h-44 w-30 shrink-0 items-center justify-center rounded-xl bg-neutral-800 text-3xl">
            {item.mediaType === "album" ? "♫" : "▶"}
          </div>
        )}
        <div className="min-w-0 pt-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            {TYPE_LABEL[item.mediaType]}
          </p>
          <h1 className="mt-1 text-xl font-bold leading-tight">{item.title}</h1>
          <p className="mt-1 text-sm text-neutral-400">
            {[item.byline, item.year].filter(Boolean).join(" · ")}
          </p>
          {item.sourceRating != null && item.sourceRating > 0 && (
            <p className="mt-2 text-sm text-neutral-300">
              ★ {item.sourceRating.toFixed(1)}
            </p>
          )}
        </div>
      </div>

      {item.synopsis && (
        <p className="mt-5 text-sm leading-relaxed text-neutral-300">
          {item.synopsis}
        </p>
      )}

      <div className="mt-6 space-y-2">
        <AddToBacklog
          catalogItemId={item.id}
          posterUrl={item.posterUrl}
          backlogs={userBacklogs.map((b) => ({ id: b.id, name: b.name }))}
        />
        <a
          href={`/api/links/resolve?catalogItemId=${item.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full rounded-full border border-neutral-600 py-3.5 text-center font-semibold hover:border-neutral-300"
        >
          {item.mediaType === "album" ? "Escuchar en tu app" : "Ver en…"}
        </a>
      </div>

      <Attribution source={item.source} mediaType={item.mediaType} />
    </main>
  );
}

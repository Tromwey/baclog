import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { getBacklogsForUser, userLovesItem } from "@/modules/backlog/queries";
import { getCatalogItem } from "@/modules/catalog/cache";
import { getCrossMediaReco } from "@/modules/recs/crossmedia";
import { defaultBacklogForSeed } from "@/app/actions/crossmedia-actions";
import { AddToBacklog } from "./add-to-backlog";
import { Attribution } from "./attribution";
import { CrossMediaDiscovery, type DiscoveryBacklog } from "./cross-media-discovery";

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

  // F3.5.5 — a cross-media reco surfaces only on a LOVED item (obsessing over,
  // or completed ★≥4). Everything downstream (grounding, cap, cache) is inside
  // getCrossMediaReco; it returns null when nothing eligible/groundable exists.
  // Guarded: if the F3.5.5 tables aren't migrated yet in an environment (deploy
  // ahead of migration), degrade to no discovery rather than break the page.
  const loves = await userLovesItem(user.id, catalogItemId);
  let reco: Awaited<ReturnType<typeof getCrossMediaReco>> = null;
  if (loves) {
    try {
      reco = await getCrossMediaReco(catalogItemId, user.id);
    } catch (err) {
      console.error("[item] cross-media reco unavailable:", err);
    }
  }
  const defaultBacklog = reco
    ? await defaultBacklogForSeed(catalogItemId)
    : null;
  const discoveryBacklogs: DiscoveryBacklog[] = userBacklogs
    .slice(0, 8)
    .map((b) => ({
      id: b.id,
      name: b.name,
      itemCount: b.itemCount,
      isSeedHome: b.id === defaultBacklog?.backlogId,
    }));

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md bg-bg px-4 pb-16 pt-6 text-text">
      <div className="flex gap-4">
        {item.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- hotlinked external CDN (ADR-007: never proxy)
          <img
            src={item.posterUrl}
            alt={`Portada de ${item.title}`}
            className="h-44 w-30 shrink-0 rounded-[var(--r-md)] object-cover shadow-[var(--shadow-card)]"
          />
        ) : (
          <div className="flex h-44 w-30 shrink-0 items-center justify-center rounded-[var(--r-md)] bg-surface-2 text-3xl text-text-3">
            {item.mediaType === "album" ? "♫" : "▶"}
          </div>
        )}
        <div className="min-w-0 pt-1">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-text-3">
            {TYPE_LABEL[item.mediaType]}
          </p>
          <h1 className="mt-1 font-serif text-2xl italic leading-tight text-text">
            {item.title}
          </h1>
          <p className="mt-1 text-sm text-text-2">
            {[item.byline, item.year].filter(Boolean).join(" · ")}
          </p>
          {item.sourceRating != null && item.sourceRating > 0 && (
            <p className="mt-2 text-sm text-accent">
              ★ {item.sourceRating.toFixed(1)}
            </p>
          )}
        </div>
      </div>

      {item.synopsis && (
        <p className="mt-5 text-sm leading-relaxed text-text-2">
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
          className="block w-full rounded-full border border-line py-3.5 text-center font-semibold text-text transition-colors hover:border-accent"
        >
          {item.mediaType === "album" ? "Escuchar en tu app" : "Ver en…"}
        </a>
      </div>

      <Attribution source={item.source} mediaType={item.mediaType} />

      {reco && (
        <CrossMediaDiscovery
          seed={{
            catalogItemId: item.id,
            title: item.title,
            type: item.mediaType,
            byline: item.byline,
            year: item.year,
            posterUrl: item.posterUrl,
          }}
          reco={{
            catalogItemId: reco.targetCatalogItemId,
            title: reco.targetTitle,
            type: reco.targetMediaType,
            byline: reco.targetByline,
            year: reco.targetYear,
            posterUrl: reco.targetPosterUrl,
          }}
          narrative={reco.narrative}
          username={user.username ?? ""}
          defaultBacklog={
            defaultBacklog
              ? { id: defaultBacklog.backlogId, name: defaultBacklog.backlogName }
              : null
          }
          backlogs={discoveryBacklogs}
        />
      )}
    </main>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import {
  getBacklogsForUser,
  getUserCatalogEntry,
  isLovedEntry,
} from "@/modules/backlog/queries";
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
  const [item, userBacklogs, entry] = await Promise.all([
    getCatalogItem(catalogItemId),
    getBacklogsForUser(user.id),
    getUserCatalogEntry(user.id, catalogItemId),
  ]);
  if (!item) notFound();

  // F3.5.6 — the cross-media reco surface now lives on /para-ti (its own nav
  // home). When the user loves this item we leave only a light teaser here that
  // links out, so the item page stays cheap (no LLM/cap work on item views).
  const loved = isLovedEntry(entry);

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
        {/* F3.5.7 — ticket share, available once you've logged the title */}
        {entry && (
          <Link
            href={`/item/${item.id}/card`}
            className="block w-full rounded-full border border-line py-3.5 text-center font-semibold text-text transition-colors hover:border-accent"
          >
            Compartir ticket
          </Link>
        )}
      </div>

      <Attribution source={item.source} mediaType={item.mediaType} />

      {/* F3.5.6 — light teaser to the reco home (only when this item is loved) */}
      {loved && (
        <Link
          href="/para-ti"
          className="mt-8 flex items-center justify-between gap-4 rounded-[var(--r-lg)] border border-line bg-surface-1 p-5 transition-colors hover:border-accent"
        >
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
              Para ti
            </p>
            <p className="mt-1 font-display text-lg font-bold leading-tight text-text">
              Hay un double feature esperándote
            </p>
            <p className="mt-1 text-sm leading-snug text-text-2">
              Amaste esto — te armamos una conexión cross-media lista para
              compartir.
            </p>
          </div>
          <span aria-hidden className="shrink-0 text-2xl text-accent">
            →
          </span>
        </Link>
      )}
    </main>
  );
}

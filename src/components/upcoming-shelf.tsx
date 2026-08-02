import Link from "next/link";
import { CountdownMono } from "./countdown";

/**
 * F3.8 — the "No puedo esperar" shelf: the titles that haven't come out yet,
 * nearest first, as covers you scroll sideways.
 *
 * ONE form for every surface (own backlog, public profile). It briefly had a
 * stacked-list variant for the profile, which read as a different feature in
 * the same product — the wait should look like the wait wherever you meet it.
 *
 * NOTHING here is user-activated. An item enters and leaves purely by its own
 * date; when the clock hits zero it drops out and goes back to being an
 * ordinary row. So there's no empty state and no "add" affordance: with
 * nothing upcoming, the section doesn't render at all.
 *
 * The carousel bleeds to the screen edge on purpose (cards should run off it,
 * not stop short), so it carries its own px-5 and expects to sit in a container
 * WITHOUT horizontal padding. Inside a padded parent, pass `-mx-5` via
 * className to cancel it.
 */

export interface UpcomingItem {
  catalogItemId: string;
  title: string;
  posterUrl: string | null;
  /** ISO string — always in the future for anything in this list. */
  releaseDate: string;
}

export function UpcomingShelf({
  items,
  initialNow,
  /** "No puedo esperar" on your own backlog; third person on someone else's. */
  heading = "No puedo esperar",
  itemHref = (id: string) => `/item/${id}`,
  className = "mt-3.5",
}: {
  items: UpcomingItem[];
  initialNow: number;
  heading?: string;
  itemHref?: (catalogItemId: string) => string;
  className?: string;
}) {
  if (items.length === 0) return null;

  const count = `${items.length} ${items.length === 1 ? "título" : "títulos"}`;

  return (
    <section className={className}>
      <div className="flex items-baseline justify-between px-5 pb-2.5">
        <h2 className="font-serif text-[23px] italic leading-none text-text">
          {heading}
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-3">
          {count}
        </span>
      </div>

      <div className="flex gap-3 overflow-x-auto px-5 pb-1 pt-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((it) => (
          <Link
            key={it.catalogItemId}
            href={itemHref(it.catalogItemId)}
            className="flex w-[132px] flex-none flex-col gap-2.5"
          >
            {it.posterUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- hotlinked external CDN (ADR-007: never proxy)
              <img
                src={it.posterUrl}
                alt={`Portada de ${it.title}`}
                className="h-[132px] w-[132px] flex-none rounded-[14px] object-cover"
              />
            ) : (
              <div className="flex h-[132px] w-[132px] flex-none items-center justify-center rounded-[14px] bg-surface-2 text-text-3">
                ♫
              </div>
            )}
            <div className="flex flex-col gap-1">
              <span className="line-clamp-2 font-serif text-[17px] italic leading-[1.08] text-text">
                {it.title}
              </span>
              <CountdownMono
                releaseDate={it.releaseDate}
                initialNow={initialNow}
                className="text-[10px] tracking-[0.1em] text-text-2"
                liveClassName="text-sm tracking-[0.02em]"
              />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

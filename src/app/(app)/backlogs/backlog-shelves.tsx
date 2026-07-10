import Link from "next/link";
import { ShelfCard, shelfSeed } from "./backlog-shelf-card";
import { NewBacklogTrigger } from "./new-backlog-button";

export interface Shelf {
  id: string;
  name: string;
  itemCount: number;
  /** The backlog's ADN — dominant colors of its items (lima fallback). */
  paletteHex: string[];
}

/**
 * The Backlogs shelf list (M3.5, mock #p1). Each shelf is a band of the
 * backlog's ADN aura; tapping links to /backlogs/[id] — a soft nav lands on
 * the intercepted zoom overlay (@modal/(.)[backlogId]), a hard nav on the
 * full page. The dashed "Nuevo estante" ghost card closes the list (it IS the
 * create entry point — the header carries no + chip in the mock). Server-
 * safe: the zoom state lives in the router now, not here.
 */
export function BacklogShelves({ shelves }: { shelves: Shelf[] }) {
  return (
    <div className="flex flex-col gap-3 px-5 pt-7">
      {shelves.map((sh) => (
        <Link key={sh.id} href={`/backlogs/${sh.id}`} className="block">
          <ShelfCard
            name={sh.name}
            itemCount={sh.itemCount}
            paletteHex={sh.paletteHex}
            seed={shelfSeed(sh.id)}
          />
        </Link>
      ))}
      <NewBacklogTrigger
        ariaLabel="Nuevo backlog"
        className="flex h-[60px] items-center justify-center gap-2.5 rounded-[18px] border-[1.5px] border-dashed border-line text-text-2 transition-colors hover:border-[#4a4a54] hover:text-text"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
        <span className="font-mono text-[11px] uppercase tracking-[0.1em]">
          Nuevo backlog
        </span>
      </NewBacklogTrigger>
    </div>
  );
}

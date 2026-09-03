"use client";

import Link from "next/link";
import { ScreenHeader, PaletteGlow, mixHexes } from "@/components/ui";
import { CoverTile, coverAspect } from "@/components/cover-tile";
import { AdnAvatar } from "@/components/adn-avatar";
import type { MediaType } from "@/modules/catalog/types";
import type {
  LatestDoubleFeature,
  ObsessionRail,
  RailWork,
} from "@/modules/recs/discover-rails";
import type { TrendingTitle } from "@/modules/social/trending";

/** The mock's short kind names for meta lines ("Cine · 2023", "Álbum · Charli xcx"). */
export const KIND_SHORT: Record<MediaType, string> = {
  film: "Cine",
  series: "Serie",
  album: "Álbum",
};

/** "{Cine|Serie} · {year}" — albums say their artist instead of a year. */
export function workMeta(w: {
  mediaType: MediaType;
  year: number | null;
  byline: string | null;
}): string {
  const tail = w.mediaType === "album" ? (w.byline ?? w.year) : w.year;
  return [KIND_SHORT[w.mediaType], tail].filter(Boolean).join(" · ");
}

const SEARCH_GLYPH = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    aria-hidden
    className="flex-none"
  >
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20l-4-4" />
  </svg>
);

/**
 * Discover's home (mock 04): header + search field, the obsession rails, the
 * trending row and the Double Feature card, in the mock's rhythm (34px between
 * sections, 20px gutter). Presentational — the parent owns the modes.
 */
export function DiscoverHome({
  rails,
  trending,
  doubleFeature,
  hasLoved,
  totalTitles,
  adnHexes,
  pending,
  onSearch,
  onRecomendar,
}: {
  rails: ObsessionRail[];
  trending: TrendingTitle[];
  doubleFeature: LatestDoubleFeature | null;
  hasLoved: boolean;
  totalTitles: number;
  /** The user's ADN — the generic card's glow when no pairing exists yet. */
  adnHexes: string[];
  pending: boolean;
  onSearch: () => void;
  onRecomendar: () => void;
}) {
  return (
    <div className="relative z-10 flex min-h-dvh flex-col pb-dock-clearance">
      <ScreenHeader title="Discover" />
      {/* 14px under the title (the header's own pb is 18). A button, not an
          input: the real field lives in the sheet it opens. */}
      <button
        type="button"
        onClick={onSearch}
        className="mx-5 -mt-1 flex items-center gap-2.5 rounded-full bg-white/[0.07] px-4 py-3 text-left text-text-3 transition-colors hover:bg-white/[0.1]"
      >
        {SEARCH_GLYPH}
        <span className="truncate text-[14px]">
          Películas, series, álbumes, gente
        </span>
      </button>

      {rails.map((rail) => (
        <ObsessionRailView key={rail.seed.catalogItemId} rail={rail} />
      ))}

      {trending.length > 0 && <TrendingView rows={trending} />}

      <DoubleFeatureCard
        pairing={doubleFeature}
        hasLoved={hasLoved}
        totalTitles={totalTitles}
        adnHexes={adnHexes}
        pending={pending}
        onRecomendar={onRecomendar}
      />
    </div>
  );
}

function SectionLabel({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="relative flex flex-col gap-0.5 px-5">
      <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-text-3">
        {eyebrow}
      </span>
      <span className="truncate font-serif text-[26px] italic leading-[1.1]">
        {title}
      </span>
    </div>
  );
}

function ObsessionRailView({ rail }: { rail: ObsessionRail }) {
  const glow = mixHexes(rail.items.map((i) => i.paletteHex));
  return (
    <article className="relative flex flex-col gap-3 pt-[34px]">
      <PaletteGlow
        hexes={glow}
        angle={110}
        opacity={0.4}
        blur={80}
        className="inset-x-0 bottom-0 top-5"
      />
      <SectionLabel eyebrow="Porque te obsesiona" title={rail.seed.title} />
      {/* The strip's bottom padding + negative margin is the mock's: room for
          the tiles' drop shadows without pushing the next section down. */}
      <div className="bl-scroll relative -mb-[26px] flex items-end gap-2.5 overflow-x-auto px-5 pb-[34px] pt-1.5">
        {rail.items.map((it) => (
          <RailTile key={it.catalogItemId} work={it} />
        ))}
      </div>
    </article>
  );
}

function RailTile({ work }: { work: RailWork }) {
  return (
    <Link
      href={`/item/${work.catalogItemId}`}
      className="flex w-[132px] flex-none flex-col gap-[7px]"
    >
      {/* The mock draws every rail tile square, whatever the kind. */}
      <CoverTile
        posterUrl={work.posterUrl}
        paletteHex={work.paletteHex}
        radius="rounded-[14px]"
        className="h-[132px] w-[132px]"
      />
      <span className="truncate font-serif text-[15px] italic leading-[1.1]">
        {work.title}
      </span>
      <span className="truncate font-mono text-[10px] uppercase tracking-[0.1em] text-text-3">
        {workMeta(work)}
      </span>
    </Link>
  );
}

function TrendingView({ rows }: { rows: TrendingTitle[] }) {
  return (
    <article className="relative flex flex-col gap-3 pt-[34px]">
      <SectionLabel eyebrow="Entre quienes sigues" title="Esta semana" />
      <div className="flex flex-col gap-3.5 px-5 pt-1">
        {rows.map((r, i) => (
          <Link
            key={r.catalogItemId}
            href={`/item/${r.catalogItemId}`}
            className="flex items-center gap-3.5"
          >
            <span className="w-[22px] flex-none text-center font-display text-[22px] font-extrabold text-text-3">
              {i + 1}
            </span>
            <CoverTile
              posterUrl={r.posterUrl}
              paletteHex={r.paletteHex}
              radius="rounded-[9px]"
              className={`w-[52px] ${coverAspect(r.mediaType)}`}
            />
            <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
              <span className="truncate font-serif text-[19px] italic leading-[1.1]">
                {r.title}
              </span>
              <span className="truncate font-mono text-[10px] uppercase tracking-[0.1em] text-text-3">
                {workMeta(r)}
              </span>
            </span>
            {/* Overlapping orbs, each ringed in the page background — a
                separator the same color as the ground, not a border. */}
            <span className="flex flex-none pl-[7px]">
              {r.people.map((p) => (
                <AdnAvatar
                  key={p.username}
                  hexes={p.avatarHexes}
                  src={p.avatarUrl}
                  className="-ml-[7px] h-5 w-5 outline outline-2 outline-bg"
                />
              ))}
            </span>
          </Link>
        ))}
      </div>
    </article>
  );
}

/**
 * The Double Feature card: the latest pairing (seed × reco) when one exists,
 * the generic invitation otherwise. Tapping runs the engine — unless the user
 * has nothing loved yet, in which case the card states the unlock and walks
 * them to the library (the old RecomendameEnEspera, folded into the card).
 */
function DoubleFeatureCard({
  pairing,
  hasLoved,
  totalTitles,
  adnHexes,
  pending,
  onRecomendar,
}: {
  pairing: LatestDoubleFeature | null;
  hasLoved: boolean;
  totalTitles: number;
  adnHexes: string[];
  pending: boolean;
  onRecomendar: () => void;
}) {
  const glow = pairing
    ? mixHexes([pairing.seed.paletteHex, pairing.reco.paletteHex])
    : adnHexes.slice(0, 4);
  const a = pairing?.seed ?? null;
  const b = pairing?.reco ?? null;

  const covers = (
    <span className="relative h-[120px] w-[110px] flex-none">
      <span className="absolute left-0 top-[10px] -rotate-[8deg]">
        <CoverTile
          posterUrl={a?.posterUrl ?? null}
          paletteHex={a?.paletteHex}
          radius="rounded-[10px]"
          className={a?.mediaType === "album" ? "h-[70px] w-[70px]" : "h-[94px] w-[70px]"}
        />
      </span>
      <span className="absolute left-[44px] top-[14px] rotate-[7deg]">
        <CoverTile
          posterUrl={b?.posterUrl ?? null}
          paletteHex={b?.paletteHex}
          radius="rounded-[10px]"
          className={!b || b.mediaType === "album" ? "h-[70px] w-[70px]" : "h-[94px] w-[70px]"}
        />
      </span>
    </span>
  );

  const shell =
    "relative mx-5 mt-[34px] block overflow-hidden rounded-[22px] bg-surface-1 text-left transition-transform active:scale-[0.99]";
  const body = "relative flex items-center gap-4 p-[18px]";
  const label =
    "font-mono text-[10.5px] uppercase tracking-[0.12em] text-text-3";
  const title = "font-serif text-[22px] italic leading-[1.08] text-pretty";
  const line = "text-[12.5px] leading-[1.35] text-text-2";

  if (!hasLoved) {
    const empty = totalTitles === 0;
    return (
      <Link href="/backlogs" className={shell}>
        <PaletteGlow hexes={glow} angle={110} opacity={0.5} blur={40} className="inset-0" />
        <span className={body}>
          {covers}
          <span className="flex min-w-0 flex-col gap-1.5">
            <span className={label}>Double feature · en espera</span>
            <span className={title}>El motor necesita saber qué amas.</span>
            <span className={line}>
              Marca un título como «me gusta» o «me obsesiona» y esto se
              enciende.{" "}
              <span className="font-semibold text-accent">
                {empty ? "Empieza un backlog →" : "Ir a mis títulos →"}
              </span>
            </span>
          </span>
        </span>
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onRecomendar}
      disabled={pending}
      className={`${shell} w-[calc(100%-40px)] disabled:opacity-70`}
    >
      <PaletteGlow hexes={glow} angle={110} opacity={0.5} blur={40} className="inset-0" />
      <span className={body}>
        {covers}
        <span className="flex min-w-0 flex-col gap-1.5">
          <span className={label}>Double feature</span>
          <span className={title}>
            {a && b ? `${a.title} × ${b.title}` : "Tu double feature"}
          </span>
          <span className={line}>
            La película y el disco que se sienten igual.
          </span>
        </span>
      </span>
    </button>
  );
}

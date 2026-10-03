import type { CSSProperties, ReactNode } from "react";
import { Cover, Seal } from "@/components/kura/components";
import { Fan } from "@/components/kura/fan";
import type { FanCover } from "@/modules/backlog/fan";
import type { PartyContributor, PartyPerson, PartySong } from "@/modules/party-collections/types";

/**
 * Colecciones de fiesta (design/kura/fiesta-app-v2.dc.html) — the pieces the
 * invite landing (/f/{token}), the member page (/c/{id}), the carousel card
 * and /party share. Server-safe (no hooks): every piece is a thin layer over
 * the Kura primitives (`Fan`, `Cover`, `Seal`), never a rebuild of them.
 *
 * A song is a RECORD: its cover is 1:1 (§forma), so every fan and cover here
 * passes `mediaType: "album"` to the shared primitives.
 */

/* ------------------------------------------------------------------ copy */

export function songsLabel(n: number): string {
  return `${n} ${n === 1 ? "canción" : "canciones"}`;
}

/** Hero line under the name: "cada invitado agrega 3 canciones". */
export function perGuestPhrase(limit: number | null): string {
  if (limit === null) return "cada invitado agrega las que quiera";
  if (limit === 0) return "una colección para escuchar juntos";
  return `cada invitado agrega ${songsLabel(limit)}`;
}

/** "tus 3 canciones" / "tu canción" / "tus canciones". */
export function yourSongs(limit: number | null): string {
  if (limit === 1) return "tu canción";
  if (limit === null || limit === 0) return "tus canciones";
  return `tus ${limit} canciones`;
}

/** "Agrega hasta 3 canciones" / "Agrega las canciones que quieras"; null = solo ver. */
export function putPhrase(limit: number | null): string | null {
  if (limit === 0) return null;
  if (limit === null) return "Agrega las canciones que quieras";
  if (limit === 1) return "Agrega 1 canción";
  return `Agrega hasta ${limit} canciones`;
}

export function handleOf(p: PartyPerson | null): string {
  return p ? `@${p.handle}` : "alguien";
}

/** Row credit: "Agregaste tú" / "Agregó @ana" / "Agregó alguien". */
export function creditOf(song: Pick<PartySong, "mine" | "addedBy">, short = true): string {
  if (song.mine) return short ? "Agregaste tú" : "Agregaste";
  return song.addedBy ? `Agregó @${song.addedBy.handle}` : "Agregó alguien";
}

/** "20 oct" (es-MX, no dots). */
export function shortDate(d: Date | string): string {
  return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" })
    .format(new Date(d))
    .replace(/\./g, "");
}

/* --------------------------------------------------------------- visuals */

export function songFan(songs: readonly Pick<PartySong, "artworkUrl" | "paletteHex" | "title">[]): FanCover[] {
  return songs.slice(0, 3).map((s) => ({
    posterUrl: s.artworkUrl,
    paletteHex: s.paletteHex,
    mediaType: "album",
    title: s.title,
  }));
}

/** The first song that has a palette tints the page (design `feedBg`). */
export function partyHexes(songs: readonly Pick<PartySong, "paletteHex">[]): string[] {
  return songs.find((s) => s.paletteHex && s.paletteHex.length > 0)?.paletteHex ?? [];
}

/** Front cover 170 × 170, like the design's `bigFan(…, sq)` (Fan's record lead = 180 · lead/225). */
export const HERO_LEAD = 212;

/** The hero fan: three records, empty slots while loading or empty. */
export function PartyFan({
  songs,
  lead = HERO_LEAD,
  empty = false,
  label,
  className,
  style,
}: {
  songs: readonly Pick<PartySong, "artworkUrl" | "paletteHex" | "title">[];
  lead?: number;
  /** Draw the three empty slots (loading, "la pista está vacía."). */
  empty?: boolean;
  label?: string;
  className?: string;
  style?: CSSProperties;
}) {
  // Three undefined slots = three flat `--s1` squares (Fan's "missing title").
  const covers = empty || songs.length === 0 ? (new Array<FanCover>(3) as FanCover[]) : songFan(songs);
  return <Fan covers={covers} lead={lead} label={label} className={className} style={style} emptyShape="album" />;
}

/** A song's square cover (56 in the list, 64 in a sheet, 44 in the slots). */
export function SongCover({
  song,
  size,
  radius = 10,
}: {
  song: Pick<PartySong, "artworkUrl" | "paletteHex"> | null;
  size: number;
  radius?: number;
}) {
  if (!song) {
    return (
      <span
        aria-hidden
        className="block flex-none bg-[var(--glass-bg)]"
        style={{ width: size, height: size, borderRadius: radius }}
      />
    );
  }
  return (
    <Cover
      posterUrl={song.artworkUrl}
      paletteHex={song.paletteHex}
      mediaType="album"
      radius=""
      style={{ width: size, height: size, borderRadius: radius }}
    />
  );
}

/** A person's disc: their photo, else two initials; "alguien" = a quiet dot. */
export function PersonSeal({ person, size = 18 }: { person: PartyPerson | null; size?: number }) {
  if (!person) {
    return (
      <span
        aria-hidden
        className="flex flex-none items-center justify-center rounded-full bg-surface-3 text-text-2"
        style={{ width: size, height: size, fontSize: Math.round(size * 0.5) }}
      >
        ·
      </span>
    );
  }
  return <Seal name={person.name || person.handle} hexes={[]} src={person.avatarUrl} size={size} />;
}

/** The overlapping seals of the hero (up to 6 named contributors). */
export function ContributorSeals({ contributors }: { contributors: readonly PartyContributor[] }) {
  const named = contributors.filter((c) => c.person).slice(0, 6);
  if (named.length === 0) return null;
  return (
    <span className="flex" aria-hidden>
      {named.map((c, i) => (
        <span
          key={c.person!.handle}
          className="flex rounded-full shadow-[0_0_0_2px_rgba(11,11,13,.6)]"
          style={{ marginLeft: i ? -7 : 0 }}
        >
          <PersonSeal person={c.person} size={26} />
        </span>
      ))}
    </span>
  );
}

/**
 * The hero (landing + member page): fan, "colección de fiesta" eyebrow, the
 * name, the per-guest line, the seals and "de @eric · 8 canciones".
 */
export function PartyHero({
  name,
  songs,
  perGuestLimit,
  contributors,
  who,
  fanSlot,
}: {
  name: string;
  songs: readonly PartySong[];
  perGuestLimit: number | null;
  contributors: readonly PartyContributor[];
  /** "tuya · 8 canciones" / "de @eric · 8 canciones". */
  who: string;
  /** Wrapper for the fan (the /party bridge animates it). */
  fanSlot?: (fan: ReactNode) => ReactNode;
}) {
  const fan = <PartyFan songs={songs} label={songs.length ? `Portadas de ${name}` : undefined} />;
  return (
    <div className="flex flex-col items-center gap-2.5 px-6 pb-[26px] pt-2.5 text-center">
      {fanSlot ? fanSlot(fan) : fan}
      <span className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-text-2">
        colección de fiesta
      </span>
      <h1 className="font-brand text-[36px] font-normal leading-none text-text [text-wrap:balance]">{name}</h1>
      <span className="font-brand text-[16px] italic leading-[1.3] text-text-2">{perGuestPhrase(perGuestLimit)}</span>
      <div className="flex items-center gap-2">
        <ContributorSeals contributors={contributors} />
        <span className="font-sans text-[13px] text-text-2">{who}</span>
      </div>
    </div>
  );
}

/** Loading hero: the empty fan and three bars (design `loading`). */
export function PartyHeroSkeleton({ pulse }: { pulse: string }) {
  return (
    <div className={`flex flex-col items-center gap-2.5 px-6 pb-[26px] pt-2.5 ${pulse}`}>
      <PartyFan songs={[]} empty />
      <span className="mt-2 block h-2.5 w-[140px] rounded-[5px] bg-surface-2" />
      <span className="block h-8 w-[230px] rounded-[10px] bg-surface-2" />
      <span className="block h-3 w-[170px] rounded-[6px] bg-surface-1" />
    </div>
  );
}

/** One row of "las canciones": cover 56, italic title, artist, who put it. */
export function SongRowBody({ song }: { song: PartySong }) {
  return (
    <>
      <SongCover song={song} size={56} />
      <span className="flex min-w-0 flex-1 flex-col gap-[3px] text-left">
        <span className="truncate font-brand text-[17px] italic leading-[1.2] text-text">{song.title}</span>
        {song.artist && <span className="truncate font-sans text-[14px] text-text-2">{song.artist}</span>}
        <span className="flex items-center gap-1.5 font-sans text-[12px] text-text-2">
          <PersonSeal person={song.addedBy} />
          {creditOf(song)}
        </span>
      </span>
    </>
  );
}

const SKEL_A = [140, 180, 120, 160, 110];
const SKEL_B = [90, 70, 110, 80, 100];

/** Five skeleton rows (list and search). `aside` = the button's width. */
export function SongRowsSkeleton({ pulse, aside = 44 }: { pulse: string; aside?: number }) {
  return (
    <div className={`flex flex-col gap-0.5 ${pulse}`} aria-hidden>
      {SKEL_A.map((a, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2">
          <span className="block h-14 w-14 rounded-[10px] bg-surface-2" />
          <span className="flex flex-1 flex-col gap-2">
            <span className="block h-3 rounded-[6px] bg-surface-2" style={{ width: a }} />
            <span className="block h-2.5 rounded-[5px] bg-surface-1" style={{ width: SKEL_B[i] }} />
          </span>
          <span className="block h-11 rounded-full bg-surface-1" style={{ width: aside }} />
        </div>
      ))}
    </div>
  );
}

import Link from "next/link";
import { GEAR_PATH, CHEVRON_RIGHT_PATH, PLUS_PATH } from "@/components/glyph-paths";
import { ProfileAvatar } from "@/components/profile-avatar";
import type { UpcomingItem } from "@/components/upcoming-shelf";
import {
  CHIP_44,
  Cover,
  Glyph,
  type GlyphKind,
  SectionTitle,
} from "@/components/kura/components";
import { feedSurface, feedTail, releaseLabel, tintCard } from "@/components/kura/tint";
import type {
  ObsessionTile,
  ProfileCards,
  ReactionCounts,
} from "@/modules/backlog/profile-stats";
import type { ShelfSummary } from "@/modules/backlog/shelves";
import { plural } from "@/lib/plural";
import { ShareChip } from "@/app/u/share-chip";
import { monthName } from "@/modules/backlog/recap-format";
import { profileHexes } from "@/modules/backlog/profile-hexes";
import { OwnCollections } from "./own-collections";

/**
 * 20c Perfil propio (Kura, flujo 09) — the same anatomy as the public profile
 * (/u/[username], 33a), seen from the inside:
 *
 *  - the whole page in the FEED gradient of what obsesses you (the newest
 *    obsession's cover palette; without one, your library's dominant hexes;
 *    without any, --bg: "sin portada no hay color"), 168°, continuing in its
 *    bottom tone under the dock (Colecciones formalizado · 3b);
 *  - Compartir + Ajustes (gear) 44 glass on the 64 row, at the right — every
 *    secondary action lives behind the gear, the header has no button row;
 *  - the photo or the SEAL at 128, the name in Newsreader 40 lowercase, the
 *    handle in mono 12, "N seguidores · M siguiendo" (→ your lists), the
 *    state pills (glyph 12 + mono 12 in glass) and the "recap de {mes} ›"
 *    chip;
 *  - "me obsesiona" as a strip of 150 covers, "no puedo esperar" (the F3.8
 *    wait, kept from the product in Kura's wait pill), "tus colecciones" as
 *    the pinned fan big + four more fans and "Ver las N"
 *    (CollectionsShowcase), and "tus tarjetas".
 *
 * E2 (perfil propio vacío) is the same screen with nothing in it: the header
 * stays --bg, and each section shows its empty shape (s1 placeholders that
 * lead to where you'd fill them) instead of disappearing.
 *
 * The mock's "obsesión destacada" (a picked title that tints the header, 20f)
 * has no column in the product, so the newest obsession decides. Reviews
 * have no own-count read, so the review pill isn't drawn here (it is on /u).
 * Pure server component.
 */
export function PerfilScreen({
  name,
  username,
  avatarUrl,
  isPublic,
  palette,
  counts,
  followCounts,
  upcoming,
  obsessions,
  cards,
  shelves,
  recapKey,
  now,
}: {
  name: string;
  username: string | null;
  /** F3.11 — the photo; null keeps the seal. */
  avatarUrl: string | null;
  /** Gates the @handle link and Compartir — a private profile's URL 404s. */
  isPublic: boolean;
  palette: string[];
  counts: ReactionCounts;
  followCounts: { following: number; followers: number };
  upcoming: UpcomingItem[];
  obsessions: ObsessionTile[];
  cards: ProfileCards;
  shelves: ShelfSummary[];
  recapKey: string | null;
  now: number;
}) {
  const publicUrl = username && isPublic ? `/u/${username}` : null;
  const hexes = profileHexes(obsessions, palette);
  const displayName = (name || username || "").toLowerCase();

  return (
    <div
      className="relative mx-auto min-h-dvh w-full max-w-md overflow-x-clip pb-dock-clearance text-text"
      style={{ background: feedSurface(hexes, 900), backgroundColor: feedTail(hexes) }}
    >
      <header className="flex flex-col gap-[18px] px-6 pb-[34px] pt-[calc(16px+env(safe-area-inset-top))]">
        <div className="flex items-center justify-end gap-2">
          {publicUrl && (
            <ShareChip path={publicUrl} label="Compartir tu perfil" className="h-11! w-11!" />
          )}
          <Link href="/settings" aria-label="Ajustes" className={CHIP_44}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
              <circle cx="12" cy="12" r="3" />
              <path d={GEAR_PATH} />
            </svg>
          </Link>
        </div>

        <ProfileAvatar src={avatarUrl} hexes={hexes} name={name || username || "·"} />

        <div className="flex flex-col gap-1.5">
          <h1 className="font-brand text-[40px] leading-none text-text [overflow-wrap:anywhere]">
            {displayName || "sin nombre"}
          </h1>
          {/* When the page is live, the handle IS the path to it. */}
          <span className="font-mono text-[12px] text-text-2">
            {publicUrl ? (
              <Link href={publicUrl} title="Ver tu perfil público" className="transition-[color,opacity] hover:text-text active:opacity-60">
                @{username}
              </Link>
            ) : username ? (
              <>
                @{username}
                <span className="uppercase tracking-[0.08em]"> · privado</span>
              </>
            ) : (
              <Link href="/settings/perfil" className="transition-[color,opacity] hover:text-text active:opacity-60">
                elige tu @usuario
              </Link>
            )}
          </span>
          {/* F3.10 — counts here; the LISTS are behind the links and only ever
              rendered for you (counts public, lists private). */}
          <div className="flex gap-4 text-[14px] text-text-2">
            <Link href="/perfil/seguidores" className="transition-[color,opacity] hover:text-text active:opacity-60">
              <b className="font-semibold text-text">{followCounts.followers}</b>{" "}
              {plural(followCounts.followers, "seguidor", "seguidores")}
            </Link>
            <Link href="/perfil/siguiendo" className="transition-[color,opacity] hover:text-text active:opacity-60">
              <b className="font-semibold text-text">{followCounts.following}</b> siguiendo
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-[7px]">
          <StatPill kind="obsessed" n={counts.obsessed} label="me obsesionan" />
          <StatPill kind="completed" n={counts.completed} label="completos" />
          <StatPill kind="liked" n={counts.liked} label="me gustan" />
          {recapKey && (
            <Link
              href="/recap"
              className="inline-flex h-[26px] items-center gap-1 rounded-full bg-[var(--glass-bg)] pl-3 pr-2 text-[13px] font-medium leading-none text-text bl-press hover:bg-white/[0.12]"
            >
              recap de {monthName(recapKey)}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="text-text-2" aria-hidden>
                <path d={CHEVRON_RIGHT_PATH} />
              </svg>
            </Link>
          )}
        </div>
      </header>

      <main className="flex flex-col gap-[30px] pt-2">
        <ObsessionStrip obsessions={obsessions} />
        <WaitStrip items={upcoming} now={now} />
        <OwnCollections shelves={shelves} username={username} profilePublic={isPublic} />
        <CardsFan hexes={hexes} cards={cards} recapKey={recapKey} />
      </main>

      {/* The dock floats over the page's own bottom tone, not over black. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 bottom-0 h-[150px]"
        style={{ background: `linear-gradient(transparent, ${feedTail(hexes)} 75%)` }}
      />
    </div>
  );
}

/** A glass pill of the ribbon: glyph 12 + mono 12 count (§StatusPill). */
function StatPill({ kind, n, label }: { kind: GlyphKind; n: number; label: string }) {
  return (
    <span
      aria-label={`${n} ${label}`}
      className="inline-flex items-center gap-[7px] rounded-full bg-[var(--glass-bg)] px-3 py-[7px] font-mono text-[12px] leading-none text-text"
    >
      <Glyph kind={kind} size={12} />
      {n}
    </span>
  );
}

/** A dashed-free empty cover slot (s1), the E2 placeholder. */
function EmptySlot({ href, label, w = 100 }: { href: string; label: string; w?: number }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="flex h-[150px] flex-none items-center justify-center rounded-[var(--r-cover-l)] bg-surface-1 text-text-2 bl-press-lg"
      style={{ width: w }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <path d={PLUS_PATH} />
      </svg>
    </Link>
  );
}

function ObsessionStrip({ obsessions }: { obsessions: ObsessionTile[] }) {
  return (
    <section className="flex flex-col gap-3.5">
      <div className="px-5">
        <SectionTitle>me obsesiona</SectionTitle>
      </div>
      <div className="bl-scroll flex items-end gap-3 overflow-x-auto px-5 pb-6">
        {obsessions.length === 0
          ? [0, 1, 2].map((i) => <EmptySlot key={i} href="/backlogs" label="Marca lo que te obsesiona" />)
          : obsessions.map((o) => (
              <Link key={o.catalogItemId} href={`/item/${o.catalogItemId}`} className="block flex-none bl-press-lg">
                <Cover
                  posterUrl={o.posterUrl}
                  paletteHex={o.paletteHex}
                  mediaType={o.mediaType}
                  alt={o.title}
                  className="h-[150px]"
                />
              </Link>
            ))}
      </div>
    </section>
  );
}

/**
 * F3.8 — the library-wide wait ("pediste que te avisáramos"), kept from the
 * product in Kura's wait pill ("3 d", "16 oct", "hoy"). Nothing coming =
 * nothing rendered.
 */
function WaitStrip({ items, now }: { items: UpcomingItem[]; now: number }) {
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-3.5">
      <div className="px-5">
        <SectionTitle aside={`${items.length}`}>no puedo esperar</SectionTitle>
      </div>
      <div className="bl-scroll flex items-end gap-3 overflow-x-auto px-5 pb-6">
        {items.map((it) => (
          <Link key={it.catalogItemId} href={`/item/${it.catalogItemId}`} className="block flex-none bl-press-lg">
            <Cover
              posterUrl={it.posterUrl}
              paletteHex={it.paletteHex ?? null}
              mediaType={it.mediaType}
              alt={it.title}
              wait={releaseLabel(it.releaseDate, now)}
              className="h-[150px]"
            />
          </Link>
        ))}
      </div>
    </section>
  );
}

const CARD =
  "absolute flex h-[170px] w-32 flex-col gap-1.5 rounded-[var(--r-cover-l)] p-2.5 shadow-cover bl-press-lg";
const CARD_LABEL = "font-mono text-[8px] uppercase tracking-[0.14em] text-text-2";
const CARD_TITLE = "font-brand text-[15px] italic leading-[1.1] text-text";

/**
 * "tus tarjetas" — the product's three shareable cards, kept (the mock
 * doesn't draw them) as a fan of 128×170 miniatures: the recap (→ /recap),
 * the double feature (→ /descubrir) and the ticket of the last title you
 * completed (→ its card). Tinted by your palette (flat, 168°), never a
 * made-up colour: without a palette they sit on s1/s2.
 */
function CardsFan({
  hexes,
  cards,
  recapKey,
}: {
  hexes: string[];
  cards: ProfileCards;
  recapKey: string | null;
}) {
  const ticketHref = cards.latestCompleted
    ? `/item/${cards.latestCompleted.catalogItemId}/card`
    : "/backlogs";

  return (
    <section className="flex flex-col gap-3.5 px-5">
      <SectionTitle>tus tarjetas</SectionTitle>
      <div className="relative h-[196px]">
        <Link
          href="/recap"
          aria-label="Tu recap"
          className={`${CARD} left-1 top-3.5 rotate-[-8deg]`}
          style={{ background: hexes.length ? tintCard(hexes) : "var(--surface-1)" }}
        >
          <span className={CARD_LABEL}>kura · recap</span>
          <span className={CARD_TITLE}>{recapKey ? monthName(recapKey) : "tu primer recap"}</span>
          <span className={`${CARD_LABEL} mt-auto`}>
            {cards.monthCount} {plural(cards.monthCount, "título", "títulos")} este mes
          </span>
        </Link>
        <Link
          href="/descubrir"
          aria-label="Tu double feature"
          className={`${CARD} left-[112px] top-1 rotate-[4deg] bg-surface-2`}
        >
          <span className={CARD_LABEL}>double feature</span>
          <span className={CARD_TITLE}>
            {cards.doubleFeature
              ? `${cards.doubleFeature.seedTitle} × ${cards.doubleFeature.targetTitle}`
              : "tu double feature"}
          </span>
        </Link>
        <Link
          href={ticketHref}
          aria-label="Tu último ticket"
          className={`${CARD} left-[216px] top-5 rotate-[11deg] bg-surface-1`}
        >
          <span className={CARD_LABEL}>ticket</span>
          <span className={CARD_TITLE}>
            {cards.latestCompleted?.title ?? "tu primer completo"}
          </span>
        </Link>
      </div>
    </section>
  );
}

import Link from "next/link";
import { glassChipClass } from "@/components/ui";
import { GEAR_PATH } from "@/components/glyph-paths";
import { ProfileAvatar } from "@/components/profile-avatar";
import { UpcomingShelf, type UpcomingItem } from "@/components/upcoming-shelf";
import { initialOf } from "@/modules/reviews/queries";
import type {
  ObsessionTile,
  ProfileCards,
  ReactionCounts,
} from "@/modules/backlog/profile-stats";
import { ProfileBackdrop } from "@/app/u/profile-backdrop";
import { ProfileStatPills } from "@/app/u/profile-stat-pills";
import { CoverStrip } from "@/app/u/cover-strip";

/**
 * Presentation for /perfil (Revamp UI screen 09, 2026-09-03): the gear chip
 * alone up top, the 72px orb, the Bricolage name, the @handle, the three
 * reaction pills and the followers line; then "No puede esperar", the
 * "Obsesiones actuales" strip and the "Tus tarjetas" fan. The settings list
 * lives behind the gear (/settings); per-backlog visibility moved to each
 * backlog's own screen. Pure server component.
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
  now,
}: {
  name: string;
  username: string | null;
  /** F3.11 — the photo; null keeps the ADN orb. */
  avatarUrl: string | null;
  /** Gates the @handle link — a private profile's public URL 404s. */
  isPublic: boolean;
  palette: string[];
  counts: ReactionCounts;
  followCounts: { following: number; followers: number };
  upcoming: UpcomingItem[];
  obsessions: ObsessionTile[];
  cards: ProfileCards;
  now: number;
}) {
  const publicUrl = username && isPublic ? `/u/${username}` : null;
  const initial = initialOf(name || username || "·");

  return (
    <div className="relative mx-auto min-h-dvh w-full max-w-md overflow-x-clip bg-bg pb-dock-clearance text-text">
      <ProfileBackdrop palette={palette} midStop={50} />

      <main className="relative">
        {/* Header — the gear alone. Sharing lives on the public page itself. */}
        <header className="flex justify-end px-5 pt-[calc(12px+env(safe-area-inset-top))]">
          <Link href="/settings" aria-label="Ajustes" className={glassChipClass}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.2}
              strokeLinecap="round"
              aria-hidden
            >
              <circle cx="12" cy="12" r="3" />
              <path d={GEAR_PATH} />
            </svg>
          </Link>
        </header>

        {/* Identity */}
        <div className="flex flex-col gap-1.5 px-6 pt-[18px]">
          <ProfileAvatar src={avatarUrl} palette={palette} initial={initial} />
          <h1 className="mt-3 font-display text-[44px] font-extrabold leading-none tracking-[-0.02em] text-text [overflow-wrap:anywhere]">
            {name || "Sin nombre"}
          </h1>
          {/* When the page is live, the handle IS the path to it. */}
          <div className="font-mono text-[10px] tracking-[0.1em] text-text-2">
            {publicUrl ? (
              <Link
                href={publicUrl}
                title="Ver tu perfil público"
                className="transition-colors hover:text-text"
              >
                @{username}
              </Link>
            ) : username ? (
              `@${username}`
            ) : (
              <Link href="/settings" className="transition-colors hover:text-text">
                reclama tu @handle
              </Link>
            )}
          </div>

          <ProfileStatPills counts={counts} className="mt-3.5" />

          {/* F3.10 — counts here; the LISTS are behind the links and only
              ever rendered for you (counts public, lists private). */}
          <div className="mt-4 flex gap-[18px] text-[13px] text-text-2">
            <Link href="/perfil/seguidores" className="transition-colors hover:text-text">
              <b className="font-semibold text-text">{followCounts.followers}</b> seguidores
            </Link>
            <Link href="/perfil/siguiendo" className="transition-colors hover:text-text">
              <b className="font-semibold text-text">{followCounts.following}</b> siguiendo
            </Link>
          </div>
        </div>

        {/* F3.8 — the library-wide wait. Nothing coming = nothing rendered. */}
        <UpcomingShelf
          items={upcoming}
          initialNow={now}
          inset="px-6"
          className="pt-[30px]"
        />

        <CoverStrip
          label="Obsesiones actuales"
          items={obsessions}
          height="h-[170px]"
          itemHref={(id) => `/item/${id}`}
          className="pt-[30px]"
        />

        <CardsFan palette={palette} cards={cards} now={now} />
      </main>
    </div>
  );
}

const CARD =
  "absolute flex h-[170px] w-32 flex-col gap-1.5 rounded-[12px] p-2.5 shadow-[0_12px_30px_rgba(0,0,0,.5)] transition-transform active:scale-[0.98]";
const CARD_LABEL = "font-mono text-[7px] tracking-[0.08em] text-text-3";
const CARD_TITLE = "font-serif text-[15px] italic leading-[1.1] text-text";

/**
 * "Tus tarjetas" — the mock's fan of three rotated 128×170 cards: the
 * receipt (→ /recap), the double feature (→ /descubrir) and the ticket of
 * the last title you completed (→ its card; /backlogs until there is one).
 * The mock's 7px mono is a miniature's, drawn as-is.
 */
function CardsFan({
  palette,
  cards,
  now,
}: {
  palette: string[];
  cards: ProfileCards;
  now: number;
}) {
  const month = new Date(now)
    .toLocaleDateString("es-MX", { month: "long" })
    .toUpperCase();
  const bars = [palette[0] ?? "#c7462f", palette[1] ?? "#3a5a9b", palette[2] ?? "#e8b23a"];
  const ticketHref = cards.latestCompleted
    ? `/item/${cards.latestCompleted.catalogItemId}/card`
    : "/backlogs";

  return (
    <section className="flex flex-col gap-3 px-6 pt-[26px]">
      <h2 className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-text-3">
        Tus tarjetas
      </h2>
      <div className="relative h-[190px]">
        <Link
          href="/recap"
          aria-label="Tu recibo del mes"
          className={`${CARD} left-1 top-3.5 rotate-[-8deg] bg-bg`}
        >
          <span className={CARD_LABEL}>BACLOG · RECEIPT</span>
          <span className="flex h-2 gap-0.5" aria-hidden>
            {bars.map((hex, i) => (
              <span key={i} className="flex-1" style={{ background: hex }} />
            ))}
          </span>
          <span className={CARD_LABEL}>
            {month} · {cards.monthCount} ITEMS
          </span>
        </Link>
        <Link
          href="/descubrir"
          aria-label="Tu double feature"
          className={`${CARD} left-[112px] top-1 rotate-[4deg]`}
          style={{ background: "linear-gradient(180deg, #241c1a, #161211)" }}
        >
          <span className={CARD_LABEL}>DOUBLE FEATURE</span>
          <span className={CARD_TITLE}>
            {cards.doubleFeature
              ? `${cards.doubleFeature.seedTitle} × ${cards.doubleFeature.targetTitle}`
              : "Tu double feature"}
          </span>
        </Link>
        <Link
          href={ticketHref}
          aria-label="Tu último ticket"
          className={`${CARD} left-[216px] top-5 rotate-[11deg] bg-surface-1`}
        >
          <span className={CARD_LABEL}>TICKET</span>
          <span className={CARD_TITLE}>
            {cards.latestCompleted?.title ?? "Tu primer completado"}
          </span>
        </Link>
      </div>
    </section>
  );
}

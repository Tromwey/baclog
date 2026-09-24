import Link from "next/link";
import { requireUser } from "@/auth";
import { getRenderInstant } from "@/modules/catalog/release";
import {
  getFeedCards,
  getFeedSuggestion,
  getFollowingPreview,
  getFollowSuggestions,
} from "@/modules/social/queries";
import { AdnAvatar } from "@/components/adn-avatar";
import { CHIP_44 } from "@/components/kura/components";
import { CHEVRON_RIGHT_PATH } from "@/components/glyph-paths";
import { FeedList } from "./feed-list";
import { HDR_PX } from "./feed-geometry";
import { SuggestionRow } from "./suggestions";
import { FollowAllButton } from "./follow-all-button";

/**
 * F3.10 — /feed, the Feed tab: what your people guardan, completan, reseñan y
 * esperan — en orden, sin algoritmo.
 *
 * Three shapes, decided by the data:
 *  - following nobody   → E1: the empty state IS the onboarding (people)
 *  - following, no news → a different sentence + who IS active
 *  - otherwise          → the Feed v10 stack
 */
export default async function FeedPage() {
  const user = await requireUser();
  const now = await getRenderInstant();
  // One entry query: the feed page itself carries followingCount (it loads
  // the followed ids anyway), so the empty states don't pay extra counts.
  const [page, suggestion] = await Promise.all([
    getFeedCards(user.id, { now }),
    getFeedSuggestion(user.id),
  ]);

  // The populated feed is its OWN full-height scrollport. The cards pin with
  // `position: sticky`, so the header and the cards have to share one
  // scroller — which is why FeedList owns it and takes the header as a prop.
  // Kura: the feed wears the root greys (the old `.feed-v8` scope is gone).
  if (page.followingCount > 0 && page.cards.length > 0) {
    return (
      <main className="relative isolate mx-auto h-dvh w-full max-w-[430px] overflow-hidden bg-bg text-text">
        <FeedList
          initialCards={page.cards}
          initialCursor={page.nextCursor}
          suggestion={suggestion}
          header={<FeedHeader sticky />}
        />
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md bg-bg pb-dock-clearance text-text">
      <FeedHeader />
      {page.followingCount === 0 ? (
        <EmptyNoFollows userId={user.id} />
      ) : (
        <EmptyNoActivity userId={user.id} followingCount={page.followingCount} />
      )}
    </main>
  );
}

/**
 * Feed v10 header: "tu feed" in Newsreader 36 on the baseline of the 44 glass
 * bell, 18/20/14 padding, exactly HDR_PX tall so the stack pins under it.
 *
 * NO background (founder call, 2026-09-21): a black slab read as a lid on the
 * stack; with nothing painted the card slides BEHIND the title.
 *
 * The bell: the mock's notifications (31a) don't exist in the product — no
 * follow requests, no stored notices, no "seen" state for a dot — so the
 * bell leads to Tu gente (/feed/gente: people search + suggestions), the one
 * social surface the feed was missing a door to, and it carries NO dot.
 */
function FeedHeader({ sticky = false }: { sticky?: boolean }) {
  return (
    <header
      className={`${sticky ? "sticky top-0 z-[7]" : ""} box-border flex items-end justify-between gap-3 px-5 pb-[14px] pt-[calc(18px+env(safe-area-inset-top))]`}
      style={{ height: `calc(${HDR_PX}px + env(safe-area-inset-top))` }}
    >
      <h1 className="truncate font-brand text-[36px] leading-none text-text">tu feed</h1>
      <Link href="/feed/gente" aria-label="Tu gente" className={CHIP_44}>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M6 8a6 6 0 1112 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 003.4 0" />
        </svg>
      </Link>
    </header>
  );
}

/** E1 — you follow nobody yet; the screen teaches by offering people. */
async function EmptyNoFollows({ userId }: { userId: string }) {
  const suggestions = await getFollowSuggestions(userId, 3);
  return (
    <div className="flex flex-col gap-3 px-5 pt-3.5">
      <h2 className="font-brand text-[30px] leading-[1.1] text-text text-balance">
        tu gente todavía no llega.
      </h2>
      <p className="text-[14px] leading-[1.5] text-pretty text-text-2">
        Sigue a quien comparte tus obsesiones y aquí vas a ver lo que guardan,
        completan y les obsesiona — en orden, sin algoritmo.
      </p>
      {suggestions.length > 0 && (
        <>
          <div className="mb-1.5 mt-[18px]">
            <FollowAllButton usernames={suggestions.map((s) => s.username)} />
          </div>
          <div className="flex flex-col">
            {suggestions.map((s) => (
              <SuggestionRow key={s.username} s={s} />
            ))}
          </div>
        </>
      )}
      <FindPeopleLine />
    </div>
  );
}

/** You follow people and none of them has moved anything. */
async function EmptyNoActivity({
  userId,
  followingCount,
}: {
  userId: string;
  followingCount: number;
}) {
  const [suggestions, preview] = await Promise.all([
    getFollowSuggestions(userId, 5),
    // Three stacked seals — a purpose-built light read, not a list page.
    getFollowingPreview(userId, 3),
  ]);
  const one = followingCount === 1;

  return (
    <div className="flex flex-col gap-3 px-5 pt-3.5">
      <h2 className="font-brand text-[30px] leading-[1.1] text-text text-balance">
        nadie ha movido nada.
      </h2>
      <p className="text-[14px] leading-[1.5] text-pretty text-text-2">
        {one
          ? "Sigues a 1 persona y todavía no ha guardado, completado ni reseñado nada."
          : `Sigues a ${followingCount} personas y ninguna ha guardado, completado ni reseñado nada todavía.`}{" "}
        Sigue a un par más y el feed se llena solo.
      </p>

      <Link
        href="/perfil/siguiendo"
        className="mt-3 flex min-h-[52px] items-center gap-2 rounded-[var(--r-surface)] bg-surface-1 px-4 transition-colors hover:bg-surface-2 active:bg-surface-2"
      >
        {preview.map((p, i) => (
          <AdnAvatar
            key={i}
            hexes={p.avatarHexes}
            src={p.avatarUrl}
            className={`h-7 w-7 ${i > 0 ? "-ml-4" : ""}`}
          />
        ))}
        <span className="ml-1 text-[15px] font-medium text-text">
          Sigues a {followingCount} {one ? "persona" : "personas"}
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="ml-auto text-text-2" aria-hidden>
          <path d={CHEVRON_RIGHT_PATH} />
        </svg>
      </Link>

      {suggestions.length > 0 && (
        <>
          <span className="mt-5 font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">
            Gente con actividad
          </span>
          <div className="flex flex-col">
            {suggestions.map((s) => (
              <SuggestionRow key={s.username} s={s} />
            ))}
          </div>
        </>
      )}
      <FindPeopleLine />
    </div>
  );
}

/** The empty states' footer line — a door to Tu gente (search by @ or name). */
function FindPeopleLine() {
  return (
    <Link
      href="/feed/gente"
      className="mt-3 flex min-h-11 items-center justify-center text-center text-[15px] font-medium text-text-2 transition-[color,opacity] hover:text-text active:opacity-60"
    >
      Busca a alguien por su @usuario o nombre
    </Link>
  );
}

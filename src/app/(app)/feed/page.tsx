import Link from "next/link";
import { ChevronRight, UserPlus } from "lucide-react";
import { requireUser } from "@/auth";
import { getRenderInstant } from "@/modules/catalog/release";
import {
  getFeedCards,
  getFeedSuggestion,
  getFollowingPreview,
  getFollowSuggestions,
} from "@/modules/social/queries";
import { AdnAvatar } from "@/components/adn-avatar";
import { ScreenHeader, glassChipClass } from "@/components/ui";
import { FeedList } from "./feed-list";
import { SuggestionCard, SuggestionRow } from "./suggestions";

/**
 * F3.10 — /feed, the fourth nav destination: what the people you follow
 * agregan, completan, reseñan y esperan — en orden, sin algoritmo.
 *
 * Three shapes, decided by the data:
 *  - following nobody   → the empty state IS the onboarding (rich suggestions)
 *  - following, no news → a different sentence + who IS active
 *  - otherwise          → the merged chronological feed
 */
export default async function FeedPage() {
  const user = await requireUser();
  const now = await getRenderInstant();
  // One entry query: the feed page itself carries followingCount (it loads
  // the followed ids anyway), so the empty states don't pay extra counts.
  // The v3 suggestion rides beside it (null when following nobody, so the
  // empty states — which offer people themselves — never pay for it twice).
  const [page, suggestion] = await Promise.all([
    getFeedCards(user.id, { now }),
    getFeedSuggestion(user.id),
  ]);

  // Feed v8 Stack: the populated feed is its OWN full-height scrollport. The
  // cards pin with `position: sticky`, so the header and the cards have to
  // share one scroller — which is why FeedList owns it and takes the header
  // as a prop instead of the page laying both out. `.feed-v8` scopes the
  // mock's darker greys and Space Mono to this screen (globals.css).
  if (page.followingCount > 0 && page.cards.length > 0) {
    return (
      <main className="feed-v8 relative isolate mx-auto h-dvh w-full max-w-[430px] overflow-hidden bg-bg text-text">
        <FeedList
          initialCards={page.cards}
          initialCursor={page.nextCursor}
          suggestion={suggestion}
          header={<FeedHeader />}
        />
      </main>
    );
  }

  // The empty states keep the app's chrome and tokens — the v8 mock draws
  // only the populated feed and defers them.
  return (
    <main className="mx-auto min-h-dvh w-full max-w-md pb-dock-clearance text-text">
      <ScreenHeader title="Tu feed" action={<FindPeopleChip />} glass />
      {page.followingCount === 0 ? (
        <EmptyNoFollows userId={user.id} />
      ) : (
        <EmptyNoActivity userId={user.id} followingCount={page.followingCount} />
      )}
    </main>
  );
}

/**
 * The v8 header: sticky at the top of the feed's own scrollport, 18/20/14
 * padding, and the title alone.
 *
 * NO background (founder call, 2026-09-21 — a deliberate change from the
 * mock, which paints it `var(--bg)`): the black slab read as a lid on top of
 * the stack. With nothing painted, the card slides BEHIND the title and the
 * page keeps the stack's own colour up to the very top.
 *
 * No people chip: the mock draws only the title and the founder chose to
 * match it (2026-09-21). Buscar gente is still reachable from Perfil →
 * seguidores / siguiendo (`perfil/people-screen.tsx`), and the empty states
 * below still point at it directly — it costs a tap from a populated feed,
 * it is not stranded.
 */
function FeedHeader() {
  return (
    <header className="sticky top-0 z-[7] px-5 pb-[14px] pt-[calc(18px+env(safe-area-inset-top))]">
      <h1 className="truncate font-display text-[30px] font-extrabold leading-[1.02] tracking-[-0.02em] text-text">
        Tu feed
      </h1>
    </header>
  );
}

/** Design 1b — you follow nobody yet; the screen teaches by offering people. */
async function EmptyNoFollows({ userId }: { userId: string }) {
  const suggestions = await getFollowSuggestions(userId, 3);
  return (
    <div className="px-4">
      <p className="font-serif text-[23px] italic leading-[1.24] text-pretty text-text">
        Todavía no sigues a nadie.
      </p>
      <p className="mt-2.5 text-[14.5px] leading-[1.52] text-pretty text-text-2">
        Cuando sigas a alguien, aquí aparece lo que agrega, completa y reseña —
        en orden, sin algoritmo.
      </p>
      {suggestions.length > 0 && (
        <>
          <div className="mb-3 mt-[26px] font-mono text-[9px] uppercase tracking-[0.14em] text-text-3">
            Para empezar
          </div>
          <div className="flex flex-col gap-2">
            {suggestions.map((s) => (
              <SuggestionCard key={s.username} s={s} />
            ))}
          </div>
        </>
      )}
      <FindPeopleLine />
    </div>
  );
}

/** Design 1c — you follow people and none of them has moved anything. */
async function EmptyNoActivity({
  userId,
  followingCount,
}: {
  userId: string;
  followingCount: number;
}) {
  const [suggestions, preview] = await Promise.all([
    getFollowSuggestions(userId, 5),
    // Three decorative orbs — a purpose-built light read, not a list page.
    getFollowingPreview(userId, 3),
  ]);
  const one = followingCount === 1;

  return (
    <div className="px-4">
      <p className="font-serif text-[23px] italic leading-[1.24] text-pretty text-text">
        Nadie ha movido nada.
      </p>
      <p className="mt-2.5 text-[14.5px] leading-[1.52] text-pretty text-text-2">
        {one
          ? "Sigues a 1 persona y todavía no ha agregado, completado ni reseñado nada."
          : `Sigues a ${followingCount} personas y ninguna ha agregado, completado ni reseñado nada todavía.`}{" "}
        Sigue a un par más y el feed se llena solo.
      </p>

      <Link
        href="/perfil/siguiendo"
        className="mt-5 flex items-center gap-2 rounded-[14px] bg-surface-1 px-3.5 py-3 transition-colors hover:bg-surface-2 active:bg-surface-3"
      >
        {preview.map((p, i) => (
          <AdnAvatar
            key={i}
            hexes={p.avatarHexes}
            src={p.avatarUrl}
            className={`h-[22px] w-[22px] ${i > 0 ? "-ml-[18px]" : ""}`}
          />
        ))}
        <span className="ml-1 text-[13px] text-text-2">
          Sigues a {followingCount} {one ? "persona" : "personas"}
        </span>
        <ChevronRight size={15} className="ml-auto text-text-3" />
      </Link>

      {suggestions.length > 0 && (
        <>
          <div className="mb-3 mt-[26px] font-mono text-[9px] uppercase tracking-[0.14em] text-text-3">
            Gente que sí está activa
          </div>
          <div className="flex flex-col gap-2">
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

/**
 * The header's way into Buscar gente (/feed/gente) — the ONLY discovery
 * affordance once the feed has content: the empty states' suggestions are
 * gone by then, and without this there was no way to find a second person.
 * Same glass chip as /perfil's header controls.
 */
function FindPeopleChip() {
  return (
    <Link href="/feed/gente" aria-label="Buscar gente" className={glassChipClass}>
      <UserPlus size={18} />
    </Link>
  );
}

/** The empty states' footer line (design 1b) — now a door to the search
 *  screen, which finds by @handle OR name and keeps suggesting people. */
function FindPeopleLine() {
  return (
    <Link
      href="/feed/gente"
      className="mt-[18px] block w-full text-center font-mono text-[9.5px] uppercase tracking-[0.1em] text-text-3 transition-[color,opacity] hover:text-text-2 active:opacity-60"
    >
      O busca a alguien por su @handle o nombre
    </Link>
  );
}

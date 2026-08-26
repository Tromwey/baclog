import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireUser } from "@/auth";
import { getRenderInstant } from "@/modules/catalog/release";
import {
  getFeedPage,
  getFollowingPreview,
  getFollowSuggestions,
} from "@/modules/social/queries";
import { AdnAvatar } from "@/components/adn-avatar";
import { ScreenHeader } from "@/components/ui";
import { FeedList } from "./feed-list";
import { HandleSearch } from "./handle-search";
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
  const page = await getFeedPage(user.id, { now });

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md pb-dock-clearance text-text">
      <ScreenHeader eyebrow="Feed" title="Tu feed" />
      {page.followingCount === 0 ? (
        <EmptyNoFollows userId={user.id} />
      ) : page.events.length === 0 ? (
        <EmptyNoActivity
          userId={user.id}
          followingCount={page.followingCount}
        />
      ) : (
        <FeedList initialEvents={page.events} initialCursor={page.nextCursor} />
      )}
    </main>
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
      <HandleSearch />
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
        className="mt-5 flex items-center gap-2 rounded-[14px] bg-surface-1 px-3.5 py-3 transition-colors hover:bg-surface-2"
      >
        {preview.map((p, i) => (
          <AdnAvatar
            key={i}
            hexes={p.avatarHexes}
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
      <HandleSearch />
    </div>
  );
}

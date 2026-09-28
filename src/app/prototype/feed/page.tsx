import type { FeedCard, FeedEvent, FeedSuggestion } from "@/modules/social/types";
import type { ReviewAuthor } from "@/modules/reviews/types";
import { FeedList } from "@/app/(app)/feed/feed-list";
import { FeedHeader } from "@/app/(app)/feed/feed-header";
import FeedLoading from "@/app/(app)/feed/loading";
import { ScrollOnMount } from "./scroll-on-mount";

/**
 * Feed lab (development only — `../layout.tsx` 404s it in production): the
 * populated /feed stack and its loading skeleton with sample data and no
 * session, so the web feed can be compared against iOS (`-kuraScreen feed`)
 * without logging in. Same components as the route.
 *
 * `?skeleton=1` renders `loading.tsx`; `?scroll=<px>` scrolls the stack on mount.
 * The sample mirrors iOS's `MockData` feed (f1…f10), posters left to the
 * palette fill.
 */

const who = (username: string, a: string, b: string): ReviewAuthor => ({
  username,
  initial: username[0]!.toUpperCase(),
  avatarHexes: [a, b],
  avatarUrl: null,
});

const LUCIA = who("luciarrr", "#3b5f8a", "#c78b4a");
const TONO = who("tono_v", "#7a3b2e", "#d9b36c");
const DAN = who("danpix", "#2f6b5a", "#e0c27a");
const MARIEL = who("mariel.ok", "#6b3f7a", "#e8a0a0");

let n = 0;
function ev(p: Partial<FeedEvent> & Pick<FeedEvent, "author" | "title" | "kind">): FeedEvent {
  n += 1;
  return {
    id: `${p.kind}:${n}`,
    at: "2026-09-27T12:00:00.000Z",
    when: "hace 2 h",
    catalogItemId: `item-${n}`,
    mediaType: "film",
    mediaTypeLabel: "Película",
    year: 2020,
    byline: null,
    posterUrl: null,
    paletteHex: [],
    waiting: null,
    releaseDate: null,
    backlogId: null,
    backlogName: null,
    mark: null,
    reviewBody: null,
    hasSpoiler: false,
    ...p,
  };
}

const CARDS: FeedCard[] = [
  { kind: "single", event: ev({ author: LUCIA, kind: "obsessed", title: "Mala", mediaType: "album", mediaTypeLabel: "Álbum", byline: "Devendra Banhart", paletteHex: ["#d99a9a", "#6b3b3b"] }) },
  { kind: "single", event: ev({ author: TONO, kind: "completed", mark: "liked", when: "hace 1 d", title: "Mind of Mine", mediaType: "album", mediaTypeLabel: "Álbum", byline: "ZAYN", paletteHex: ["#3a4a5e", "#b89a7a"] }) },
  {
    kind: "single",
    event: ev({
      author: DAN,
      kind: "reviewed",
      when: "hace 3 d",
      title: "El viaje de Chihiro",
      byline: "Studio Ghibli",
      paletteHex: ["#4f7f8f", "#c9725a"],
      mark: "obsessed",
      reviewBody:
        "La vi de niña y no la entendí. Ahora la entiendo menos, y me gusta más: todo lo que pasa en esa casa de baños es un sueño que se sostiene solo.",
    }),
  },
  {
    kind: "burst",
    id: "burst:1",
    author: MARIEL,
    when: "hace 6 d",
    backlogId: "pendientes",
    backlogName: "pendientes",
    items: [
      ev({ author: MARIEL, kind: "added", title: "Pearl", byline: "Ti West", paletteHex: ["#8f6b3a", "#2e4a2e"] }),
      ev({ author: MARIEL, kind: "added", title: "Spider-Man 3", byline: "Sam Raimi", paletteHex: ["#7a2e2e", "#1e2e4a"] }),
      ev({ author: MARIEL, kind: "added", title: "La odisea", byline: "Christopher Nolan", paletteHex: ["#5a6b7a", "#2a2a2a"] }),
      ev({ author: MARIEL, kind: "added", title: "Severance", mediaType: "series", mediaTypeLabel: "Serie", byline: "Apple TV+", paletteHex: ["#3a6b8f", "#e0e0e0"] }),
      ev({ author: MARIEL, kind: "added", title: "You Can't Escape", mediaType: "album", mediaTypeLabel: "Álbum", byline: "Sample Artist", paletteHex: ["#b0a36a", "#3a3a5a"] }),
    ],
  },
  { kind: "single", event: ev({ author: DAN, kind: "added", when: "hace 1 sem", title: "La odisea", byline: "Christopher Nolan", backlogId: "estrenos", backlogName: "estrenos", waiting: "sale el 17 jul", paletteHex: ["#5a6b7a", "#2a2a2a"] }) },
  { kind: "single", event: ev({ author: TONO, kind: "obsessed", when: "hace 1 mes", title: "Mind of Mine", mediaType: "album", mediaTypeLabel: "Álbum", byline: "ZAYN", paletteHex: ["#3a4a5e", "#b89a7a"] }) },
  { kind: "single", event: ev({ author: LUCIA, kind: "completed", when: "hace 2 meses", title: "Ma", byline: "Ari Aster", paletteHex: ["#6a4a6a", "#1a1a2a"] }) },
  { kind: "single", event: ev({ author: TONO, kind: "added", when: "hace 1 año", title: "Eduardo", mediaType: "album", mediaTypeLabel: "Álbum", backlogId: "musica-2026", backlogName: "música 2026", paletteHex: ["#c9a06a", "#3a2a1a"] }) },
];

const SUGGESTION: FeedSuggestion = {
  username: "nico.ve",
  initial: "N",
  avatarHexes: ["#3a6b5a", "#d9b36c"],
  avatarUrl: null,
  common: "Sigue a @danpix y @luciarrr",
  reason: "También le obsesiona El viaje de Chihiro",
  covers: [
    { catalogItemId: "c1", posterUrl: "", mediaType: "film", paletteHex: ["#4f7f8f", "#c9725a"] },
    { catalogItemId: "c2", posterUrl: "", mediaType: "film", paletteHex: ["#8f6b3a", "#2e4a2e"] },
    { catalogItemId: "c3", posterUrl: "", mediaType: "film", paletteHex: ["#6a4a6a", "#1a1a2a"] },
  ],
};

export default async function FeedLab({
  searchParams,
}: {
  searchParams: Promise<{ skeleton?: string; scroll?: string }>;
}) {
  const { skeleton, scroll } = await searchParams;
  if (skeleton) return <FeedLoading />;
  return (
    <main className="relative isolate mx-auto h-dvh w-full max-w-[430px] overflow-hidden bg-bg text-text">
      <FeedList
        initialCards={CARDS}
        initialCursor={null}
        suggestion={SUGGESTION}
        header={<FeedHeader sticky />}
      />
      {scroll && <ScrollOnMount top={Number(scroll)} />}
    </main>
  );
}

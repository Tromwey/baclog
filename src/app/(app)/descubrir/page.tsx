import { requireUser } from "@/auth";
import { getBacklogsForUser } from "@/modules/backlog/queries";
import { getFirstRunCounts } from "@/modules/backlog/first-run";
import { getLibraryUpcoming } from "@/modules/backlog/library";
import {
  getLatestDoubleFeature,
  getObsessionRails,
} from "@/modules/recs/discover-rails";
import { recCards } from "@/modules/recs/discover-cards";
import { getFollowedCollections } from "@/modules/social/followed-collections";
import { getKuradas } from "@/modules/social/kurada";
import { getKuraTrending } from "@/modules/social/trending";
import { getRenderInstant } from "@/modules/catalog/release";
import { DescubrirScreen, type SearchBacklog } from "./descubrir-screen";
import { getLibraryIndex } from "./library-index";

/**
 * Descubrir (Kura · flujos-v2 19a, "Descubrir Final – Todo" 3a). Everything
 * the home draws is a cache or derived read — NO engine call on load (ADR-009
 * meters generations): the obsession rails become the "recomendado para ti"
 * cards (each with its seed, the obsession it hangs from), "colecciones para
 * ti" are the showcased collections of people you follow, the trend is
 * what's trending on Kura this week, the releases are the ones still ahead in
 * your own collections (with the collection they're in). The Double Feature
 * feed is only fetched on its card's tap. Plus what "guardar" needs to be
 * honest: the collections and the caller's own membership index.
 *
 * The format pages (Cine · Series · Música, "Descubrir Final – Formatos")
 * fetch their shelves when opened; only their closing Kurada rows — the
 * team's public collections — are read here.
 */
export default async function DescubrirPage() {
  const user = await requireUser();
  const now = await getRenderInstant();
  const [list, counts, rails, trending, upcoming, doubleFeature, library, kuradas, followed] =
    await Promise.all([
      getBacklogsForUser(user.id),
      getFirstRunCounts(user.id),
      getObsessionRails(user.id, { maxRails: 4, perRail: 4 }),
      getKuraTrending(user.id, new Date(now), 5),
      getLibraryUpcoming(user.id, now, 12),
      getLatestDoubleFeature(user.id),
      getLibraryIndex(user.id),
      getKuradas(user.id),
      getFollowedCollections(user.id, 4),
    ]);

  // No slice: every collection has to be reachable as a save target.
  const backlogs: SearchBacklog[] = list.map((b) => ({
    id: b.id,
    name: b.name,
    itemCount: b.itemCount,
    paletteHex: b.paletteHex,
  }));

  const seedById = new Map(rails.map((r) => [r.seed.catalogItemId, r.seed]));
  const nameById = new Map(list.map((b) => [b.id, b.name]));

  return (
    <DescubrirScreen
      username={user.username ?? ""}
      backlogs={backlogs}
      library={library}
      // Per-TITLE count (user_item), not the membership sum.
      totalTitles={counts.items}
      hasLoved={counts.loved > 0}
      recs={recCards(rails).map((c) => ({ ...c, seed: seedById.get(c.seedTitleId) ?? null }))}
      trending={trending}
      upcoming={upcoming.map((u) => {
        const first = library.byTitle[u.catalogItemId]?.[0];
        return { ...u, collection: first ? (nameById.get(first.backlogId) ?? null) : null };
      })}
      now={now}
      doubleFeature={doubleFeature}
      kuradas={kuradas}
      followedCollections={followed}
    />
  );
}

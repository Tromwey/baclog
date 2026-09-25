import { requireUser } from "@/auth";
import { getBacklogsForUser } from "@/modules/backlog/queries";
import { getFirstRunCounts } from "@/modules/backlog/first-run";
import { getLibraryUpcoming } from "@/modules/backlog/library";
import {
  getLatestDoubleFeature,
  getObsessionRails,
} from "@/modules/recs/discover-rails";
import { recCards } from "@/modules/recs/discover-cards";
import { getKuraTrending } from "@/modules/social/trending";
import { getRenderInstant } from "@/modules/catalog/release";
import { DescubrirScreen, type SearchBacklog } from "./descubrir-screen";
import { getLibraryIndex } from "./library-index";

/**
 * Descubrir (Kura · flujos-v2 19a). Everything the home draws is a cache or
 * derived read — NO engine call on load (ADR-009 meters generations): the
 * obsession rails become the "recomendado para ti" cards, the trend is what's
 * trending on Kura this week, the releases are the ones still
 * ahead in your own collections. The Double Feature feed is only fetched on
 * its card's tap. Plus what "guardar" needs to be honest: the collections and
 * the caller's own membership index.
 *
 * Trending and rails are read wider than they're shown: the format track
 * filters on the client, and "Cine" should still find five.
 */
export default async function DescubrirPage() {
  const user = await requireUser();
  const now = await getRenderInstant();
  const [list, counts, rails, trending, upcoming, doubleFeature, library] =
    await Promise.all([
      getBacklogsForUser(user.id),
      getFirstRunCounts(user.id),
      getObsessionRails(user.id, { maxRails: 4, perRail: 4 }),
      getKuraTrending(user.id, new Date(now), 15),
      getLibraryUpcoming(user.id, now, 12),
      getLatestDoubleFeature(user.id),
      getLibraryIndex(user.id),
    ]);

  // No slice: every collection has to be reachable as a save target.
  const backlogs: SearchBacklog[] = list.map((b) => ({
    id: b.id,
    name: b.name,
    itemCount: b.itemCount,
    paletteHex: b.paletteHex,
  }));

  return (
    <DescubrirScreen
      username={user.username ?? ""}
      backlogs={backlogs}
      library={library}
      // Per-TITLE count (user_item), not the membership sum.
      totalTitles={counts.items}
      hasLoved={counts.loved > 0}
      recs={recCards(rails)}
      trending={trending}
      upcoming={upcoming}
      now={now}
      doubleFeature={doubleFeature}
    />
  );
}

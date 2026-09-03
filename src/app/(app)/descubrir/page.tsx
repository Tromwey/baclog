import { requireUser } from "@/auth";
import { getBacklogsForUser, getUserPalette } from "@/modules/backlog/queries";
import { getFirstRunCounts } from "@/modules/backlog/first-run";
import {
  getLatestDoubleFeature,
  getObsessionRails,
} from "@/modules/recs/discover-rails";
import { getTrendingAmongFollowed } from "@/modules/social/trending";
import { DescubrirScreen, type SearchBacklog } from "./descubrir-screen";

/**
 * Discover (Revamp UI, 2026-09-03 — mock screen 04). The page loads what the
 * home renders: the obsession rails and the trending row (both cache/derived
 * reads — NO engine call on load, ADR-009 meters generations), the latest
 * double feature for the card, the backlogs for the search sheet's "Agregar
 * a" picker (with their palette: the sheet glows in the target's colors) and
 * the ADN palette for the "Recomiéndame" loading aura. The reco feed itself is
 * still only fetched on the card's tap (getDiscoverFeedAction).
 */
export default async function DescubrirPage() {
  const user = await requireUser();
  const [list, palette, counts, rails, trending, doubleFeature] =
    await Promise.all([
      getBacklogsForUser(user.id),
      getUserPalette(user.id),
      getFirstRunCounts(user.id),
      getObsessionRails(user.id, { maxRails: 3, perRail: 4 }),
      getTrendingAmongFollowed(user.id, new Date(), 3),
      getLatestDoubleFeature(user.id),
    ]);

  // No slice: every backlog has to be reachable as an add target.
  const backlogs: SearchBacklog[] = list.map((b) => ({
    id: b.id,
    name: b.name,
    itemCount: b.itemCount,
    paletteHex: b.paletteHex,
  }));
  // Per-TITLE count (user_item), not the membership sum: a title filed in two
  // backlogs is one title, and it's the same number the reco engine reasons over.
  const totalTitles = counts.items;

  return (
    <DescubrirScreen
      username={user.username ?? ""}
      backlogs={backlogs}
      totalTitles={totalTitles}
      hasLoved={counts.loved > 0}
      loadingColors={palette}
      rails={rails}
      trending={trending}
      doubleFeature={doubleFeature}
    />
  );
}

import { requireUser } from "@/auth";
import { getBacklogsForUser, getUserPalette } from "@/modules/backlog/queries";
import { getFirstRunCounts } from "@/modules/backlog/first-run";
import type { DiscoveryBacklog } from "@/app/(app)/item/[catalogItemId]/cross-media-discovery";
import { DescubrirScreen } from "./descubrir-screen";

/**
 * F3.5.6 (M3.5 nav) — Descubrir, the merged destination (Buscar + Para ti).
 * The page loads what the entry screen needs (backlogs for the picker, the
 * title count for the copy) plus the ADN palette — used ONLY for the immersive
 * full-screen aura on the "Recomiéndame" loading state (the one screen with its
 * own emphatic background). The reco feed itself is NOT fetched here — it runs
 * on an explicit tap (getDiscoverFeedAction).
 */
export default async function DescubrirPage() {
  const user = await requireUser();
  const [list, palette, counts] = await Promise.all([
    getBacklogsForUser(user.id),
    getUserPalette(user.id),
    getFirstRunCounts(user.id),
  ]);

  // No slice: the picker used to be handed only the first 8, which silently
  // made a 9th backlog unreachable from Descubrir. Now that the list caps
  // itself at 5 and offers "ver los N restantes", that count has to be the
  // truth — an affordance promising the rest can't be missing one.
  const backlogs: DiscoveryBacklog[] = list.map((b) => ({
    id: b.id,
    name: b.name,
    itemCount: b.itemCount,
  }));
  // Per-TITLE count (user_item), not the membership sum: a title filed in two
  // backlogs is one title to distil from, and it's the same number the reco
  // engine reasons over.
  const totalTitles = counts.items;

  return (
    <DescubrirScreen
      username={user.username ?? ""}
      backlogs={backlogs}
      totalTitles={totalTitles}
      hasLoved={counts.loved > 0}
      loadingColors={palette}
    />
  );
}

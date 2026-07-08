import { requireUser } from "@/auth";
import { getBacklogsForUser, getUserPalette } from "@/modules/backlog/queries";
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
  const [list, palette] = await Promise.all([
    getBacklogsForUser(user.id),
    getUserPalette(user.id),
  ]);

  const backlogs: DiscoveryBacklog[] = list.slice(0, 8).map((b) => ({
    id: b.id,
    name: b.name,
    itemCount: b.itemCount,
  }));
  const totalTitles = list.reduce((n, b) => n + b.itemCount, 0);

  return (
    <DescubrirScreen
      username={user.username ?? ""}
      backlogs={backlogs}
      totalTitles={totalTitles}
      loadingColors={palette}
    />
  );
}

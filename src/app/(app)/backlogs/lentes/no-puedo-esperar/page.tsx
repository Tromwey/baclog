import { requireUser } from "@/auth";
import { ThemeColorSync } from "@/components/theme-color-sync";
import { tintEnds } from "@/components/kura/tint";
import { getLibraryUpcoming } from "@/modules/backlog/library";
import { getRenderInstant } from "@/modules/catalog/release";
import { HideDock } from "../../hide-dock";
import {
  CollectionScreen,
  type CollectionItem,
} from "../../[backlogId]/collection-screen";

/**
 * "no puedo esperar" — the AUTOMATIC collection (flujos-v2 37b, K2 folded
 * into Tus colecciones): every title of the library whose release is still
 * ahead, soonest first, each wearing how long is left. Nothing here is
 * user-activated: a title enters and leaves by its own date, so there are no
 * membership actions — Opciones only switches the view.
 *
 * A static segment, so it wins over `lentes/[kind]`.
 */
export default async function WaitingCollectionPage() {
  const user = await requireUser();
  const now = await getRenderInstant();
  const upcoming = await getLibraryUpcoming(user.id, now, 200);

  const items: CollectionItem[] = upcoming.map((u) => ({
    backlogItemId: u.catalogItemId,
    catalogItemId: u.catalogItemId,
    title: u.title,
    byline: null,
    mediaType: u.mediaType,
    year: null,
    posterUrl: u.posterUrl,
    paletteHex: u.paletteHex ? [...u.paletteHex] : null,
    status: "on_my_radar",
    verdict: null,
    obsessed: false,
    releaseDate: u.releaseDate,
    addedAt: u.releaseDate,
  }));
  const lead = items.find((i) => i.paletteHex?.length)?.paletteHex ?? [];

  return (
    <main>
      <ThemeColorSync color={lead.length ? tintEnds(lead)[0] : undefined} exact />
      <HideDock />
      <CollectionScreen
        mode="auto"
        backlog={{ id: "no-puedo-esperar", name: "no puedo esperar", vibe: null, visibility: "private" }}
        items={items}
        now={now}
      />
    </main>
  );
}

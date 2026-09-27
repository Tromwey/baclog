import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { getCatalogItem } from "@/modules/catalog/cache";
import { getUserCatalogEntry } from "@/modules/backlog/queries";
import { toCardBacklog } from "@/modules/cards/adapter";
import { CardExporter } from "@/components/card-exporter";

/**
 * F3.5.7 — sharing an ITEM exports the TITLE CARD (modules/cards/render/
 * title.ts), directly. Built from the user's own entry for the item, so it
 * prints the real state (Completo, Me obsesiona, Me gusta, No puedo esperar).
 * You can only share a title you've saved; otherwise this 404s and the item
 * page shows "add first".
 */
export default async function ItemCardPage({
  params,
}: {
  params: Promise<{ catalogItemId: string }>;
}) {
  const user = await requireUser();
  const { catalogItemId } = await params;

  const [item, entry] = await Promise.all([
    getCatalogItem(catalogItemId),
    getUserCatalogEntry(user.id, catalogItemId),
  ]);
  if (!item) notFound();
  if (!entry) notFound();

  // The card needs exactly one item; reuse the M2 adapter (its home backlog
  // name prints in the foot). Adapter shape can't carry artwork (ADR-008).
  const cardBacklog = toCardBacklog(entry.backlogName, null, user.username, [
    entry,
  ]);

  return (
    <CardExporter
      backlog={cardBacklog}
      style="title"
      publicUrl={
        user.username && user.isPublic
          ? `https://baclog.app/${user.username}/item/${catalogItemId}`
          : null
      }
    />
  );
}

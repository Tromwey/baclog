import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { getCatalogItem } from "@/modules/catalog/cache";
import { getUserCatalogEntry } from "@/modules/backlog/queries";
import { toCardBacklog } from "@/modules/cards/adapter";
import { CardExporter } from "@/components/card-exporter";

/**
 * F3.5.7 — sharing an ITEM exports the TICKET (a single-title admission stub),
 * directly. Built from the user's own entry for the item, so the ticket stamps
 * the real status + rating. You can only ticket a title you've logged (there's
 * a status to stamp); otherwise this 404s and the item page shows "add first".
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

  // The ticket needs exactly one item; reuse the M2 adapter (its home backlog
  // name becomes the ticket's "ROW"). Adapter shape can't carry artwork (ADR-008).
  const cardBacklog = toCardBacklog(entry.backlogName, null, user.username, [
    entry,
  ]);

  return (
    <CardExporter
      backlog={cardBacklog}
      style="ticket"
      publicUrl={
        user.username && user.isPublic
          ? `https://baclog.app/${user.username}/item/${catalogItemId}`
          : null
      }
    />
  );
}

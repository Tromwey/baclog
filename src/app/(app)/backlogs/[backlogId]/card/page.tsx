import { notFound } from "next/navigation";
import { NotFoundError, UnauthorizedError, assertOwnsBacklog } from "@/authz";
import { toCardBacklog } from "@/modules/cards/adapter";
import { getBacklogItems } from "@/modules/backlog/queries";
import { CardExporter } from "@/components/card-exporter";

export default async function CardPage({
  params,
}: {
  params: Promise<{ backlogId: string }>;
}) {
  const { backlogId } = await params;
  let backlog, user;
  try {
    ({ backlog, user } = await assertOwnsBacklog(backlogId));
  } catch (err) {
    if (err instanceof NotFoundError || err instanceof UnauthorizedError) {
      notFound();
    }
    throw err;
  }

  const items = await getBacklogItems(backlog.id);
  if (items.length === 0) notFound(); // ticket style needs at least one item

  const cardBacklog = toCardBacklog(
    backlog.name,
    backlog.vibe,
    user.username,
    items,
  );

  // F3.5.7 — sharing a BACKLOG exports the RECEIPT (the typographic list of its
  // items), directly, with no generic style picker.
  return (
    <CardExporter
      backlog={cardBacklog}
      style="receipt"
      eyebrow={cardBacklog.name}
      subtitle="tu backlog, como recibo"
      publicUrl={
        user.username && user.isPublic
          ? `https://baclog.app/${user.username}/${backlog.id}`
          : null
      }
    />
  );
}

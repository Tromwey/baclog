import { notFound } from "next/navigation";
import { NotFoundError, UnauthorizedError, assertOwnsBacklog } from "@/authz";
import { toCardBacklog } from "@/modules/cards/adapter";
import { getBacklogItems } from "@/modules/backlog/queries";
import { fanOf } from "@/modules/backlog/fan";
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
  if (items.length === 0) notFound(); // the card draws at least one cover

  // The fan leads: the chosen cover, then the manual order (fan.ts) — the
  // renderer draws `items[0..2]` as the fan and counts them all.
  const fan = fanOf(items, backlog.coverCatalogItemId);
  const ordered = [...fan, ...items.filter((it) => !fan.includes(it))];
  const cardBacklog = toCardBacklog(backlog.name, backlog.vibe, user.username, ordered);

  // Colecciones formalizado · 4b — sharing a collection exports its FAN card
  // (9:16, the fan on its feed gradient; palettes, never art — ADR-008),
  // directly, with no style picker. F3.10.1: a PRIVATE collection's URL
  // 404s, so the link doesn't travel and the note says why — never a dead
  // link on the viral surface.
  const accountPublic = Boolean(user.username && user.isPublic);
  return (
    <CardExporter
      backlog={cardBacklog}
      style="collection"
      eyebrow={cardBacklog.name}
      subtitle="tu colección, como tarjeta"
      publicUrl={
        accountPublic && backlog.isPublic
          ? `https://baclog.app/${user.username}/${backlog.id}`
          : null
      }
      noLinkNote={
        accountPublic && !backlog.isPublic
          ? "Esta colección es solo tuya: la tarjeta viaja sin link. Cámbialo en Opciones › Quién la ve."
          : undefined
      }
    />
  );
}

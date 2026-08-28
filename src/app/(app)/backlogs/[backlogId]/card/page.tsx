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
  // items), directly, with no generic style picker. F3.10.1: a PRIVATE
  // backlog's URL 404s, so the link doesn't travel and the note says why —
  // never a dead link on the viral surface.
  const accountPublic = Boolean(user.username && user.isPublic);
  return (
    <CardExporter
      backlog={cardBacklog}
      style="receipt"
      eyebrow={cardBacklog.name}
      subtitle="tu backlog, como recibo"
      publicUrl={
        accountPublic && backlog.isPublic
          ? `https://baclog.app/${user.username}/${backlog.id}`
          : null
      }
      noLinkNote={
        accountPublic && !backlog.isPublic
          ? "Este backlog es privado — la tarjeta viaja sin link. Cámbialo en Perfil · Editar."
          : undefined
      }
    />
  );
}

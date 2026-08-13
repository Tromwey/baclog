import { fetched, requireAdmin } from "@/modules/admin/guard";
import { getReviewQueue, type QueueEntry } from "@/modules/admin/reviews";
import { plural } from "@/lib/plural";
import { Card, CardLabel, EmptyNote, SectionError } from "../ui";
import { QueueActions } from "./queue-actions";

/**
 * Torre de Control · Reseñas (F3.9) — the moderation queue, and the portal's
 * only screen with a write on it.
 *
 * The reported TEXT is the protagonist: no user cards, no avatars, no
 * thumbnails. An operator is judging 280 characters, and everything else
 * (author, visibility, repeat count, title, age) is one tertiary mono line
 * underneath. The dot carries the state exactly like it does in Salud.
 */
export default async function AdminReviewsPage() {
  await requireAdmin();
  const queue = await fetched(getReviewQueue());

  if (!queue.ok) {
    return (
      <div className="flex flex-col gap-3 pt-[4px]">
        <Card>
          <CardLabel>Reportadas</CardLabel>
          <SectionError retryHref="/admin/resenas" />
        </Card>
      </div>
    );
  }

  const { pending, hiddenEntries, pendingCount, hiddenCount, publishedCount } =
    queue.data;
  const share =
    publishedCount > 0
      ? `${((pendingCount / publishedCount) * 100).toFixed(1).replace(".", ",")} %`
      : "—";

  return (
    <div className="flex flex-col gap-3 pt-[4px]">
      {/* The summary is the first card: how many are waiting, out of how many
          exist. No chart — four reports are not a time series. */}
      <Card>
        <div className="flex items-baseline justify-between gap-2">
          <CardLabel>Reportadas</CardLabel>
          <span className="font-mono text-[10px] tracking-[0.04em] text-text-2">
            {pendingCount} {plural(pendingCount, "pendiente", "pendientes")} ·{" "}
            {hiddenCount} {plural(hiddenCount, "oculta", "ocultas")}
          </span>
        </div>
        <div className="mt-[13px] flex items-center gap-[10px]">
          <span className="font-display text-[30px] font-extrabold leading-none tracking-[-0.02em]">
            {pendingCount}
          </span>
          <span className="text-xs leading-[1.4] text-text-3">
            de {publishedCount.toLocaleString("es-ES")}{" "}
            {plural(publishedCount, "reseña publicada", "reseñas publicadas")} ·{" "}
            {share}
          </span>
        </div>
      </Card>

      {pending.length === 0 && hiddenEntries.length === 0 && (
        <Card>
          <CardLabel>Cola</CardLabel>
          <EmptyNote>Sin reportes. La cola está limpia.</EmptyNote>
        </Card>
      )}

      {pending.map((entry) => (
        <QueueCard key={entry.reviewId} entry={entry} />
      ))}
      {hiddenEntries.map((entry) => (
        <QueueCard key={entry.reviewId} entry={entry} />
      ))}
    </div>
  );
}

/**
 * Ámbar = several reports, grey = one loose report, red = already hidden. The
 * card never changes color; only the dot does, plus the drop to 62% opacity
 * once it's hidden.
 */
function QueueCard({ entry }: { entry: QueueEntry }) {
  const dotClass = entry.hidden
    ? "bg-bad"
    : entry.reportCount > 1
      ? "bg-warn"
      : "bg-text-3";

  const heading = entry.hidden
    ? `Oculta ${entry.when} · ${entry.reasons.join(", ")}`
    : `${entry.reportCount} ${plural(entry.reportCount, "reporte", "reportes")} · ${entry.reasons.join(", ")}`;

  return (
    <Card className={entry.hidden ? "opacity-[0.62]" : undefined}>
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className={`h-[7px] w-[7px] flex-none rounded-full ${dotClass}`}
        />
        <span className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-text-2">
          {heading}
        </span>
      </div>
      <p
        className={`mt-[11px] text-[13.5px] leading-[1.5] ${
          entry.hidden ? "text-text-2" : "text-text"
        }`}
      >
        {entry.body}
      </p>
      <div className="mt-[11px] flex flex-wrap gap-[10px] font-mono text-[9.5px] tracking-[0.03em] text-text-3">
        <span>@{entry.username ?? "sin handle"}</span>
        <span>{entry.authorIsPublic ? "PÚBLICO" : "PRIVADO"}</span>
        <span>{entry.offense}.ª vez</span>
        <span className="uppercase">{entry.title}</span>
        {entry.hasSpoiler && <span>MARCADA SPOILER</span>}
        {!entry.hidden && <span>{entry.when}</span>}
      </div>
      <QueueActions reviewId={entry.reviewId} hidden={entry.hidden} />
    </Card>
  );
}

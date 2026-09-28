import { fetched, requireAdmin } from "@/modules/admin/guard";
import { PARTY_EVENT } from "@/modules/party/event";
import { listRsvps } from "@/modules/party/rsvp";
import { plural } from "@/lib/plural";
import { Card, CardLabel, EmptyNote, SectionError } from "../ui";

/**
 * Torre de Control · Fiesta — the host's view of the /party invitation's
 * RSVPs (`party_rsvp`). Read-only, admin-gated like every Torre page. Not in
 * the tab strip (one-off event): reached by URL.
 */
export default async function AdminPartyPage() {
  await requireAdmin();
  const rows = await fetched(listRsvps());

  if (!rows.ok) {
    return (
      <Card>
        <CardLabel>{PARTY_EVENT.title}</CardLabel>
        <SectionError retryHref="/admin/party" />
      </Card>
    );
  }

  const yes = rows.data.filter((r) => r.attending);
  const no = rows.data.length - yes.length;
  const heads = yes.reduce((n, r) => n + (r.plusOne ? 2 : 1), 0);

  return (
    <div className="flex flex-col gap-3 pt-[4px]">
      <Card>
        <div className="flex items-baseline justify-between gap-2">
          <CardLabel>{PARTY_EVENT.title}</CardLabel>
          <span className="font-mono text-[10px] tracking-[0.04em] text-text-2">
            {yes.length} sí · {no} no
          </span>
        </div>
        <div className="mt-[13px] flex items-center gap-[10px]">
          <span className="font-display text-[30px] font-extrabold leading-none tracking-[-0.02em]">
            {heads}
          </span>
          <span className="text-xs leading-[1.4] text-text-3">
            {plural(heads, "persona", "personas")} contando los +1
          </span>
        </div>
      </Card>

      {rows.data.length === 0 ? (
        <Card>
          <CardLabel>Respuestas</CardLabel>
          <EmptyNote>Nadie ha cruzado la puerta todavía.</EmptyNote>
        </Card>
      ) : (
        rows.data.map((r) => (
          <Card key={r.id}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[15px] font-semibold text-text">{r.name}</span>
              <span
                className={`font-mono text-[10px] tracking-[0.04em] ${r.attending ? "text-completed" : "text-text-3"}`}
              >
                {r.attending ? (r.plusOne ? "VA +1" : "VA") : "NO VA"}
              </span>
            </div>
            {r.attending && (
              <div className="mt-2 flex flex-col gap-1 text-[13px] leading-[1.45] text-text-2">
                {r.plusOne && <span>Acompañante: {r.plusName || "sin nombre"}</span>}
                {r.costume && <span>Disfraz: {r.costume}</span>}
                {r.drink && <span>Bebida: {r.drink}</span>}
                {r.diets.length > 0 && <span>Dieta: {r.diets.join(", ")}</span>}
              </div>
            )}
            <div className="mt-2 font-mono text-[10px] tracking-[0.04em] text-text-3">
              {r.updatedAt.toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

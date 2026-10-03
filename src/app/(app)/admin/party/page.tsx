import { fetched, requireAdmin } from "@/modules/admin/guard";
import { PARTY_EVENT } from "@/modules/party/event";
import { labMonitor } from "@/modules/party/lab";
import { listRsvps } from "@/modules/party/rsvp";
import { plural } from "@/lib/plural";
import { Bar, Card, CardLabel, EmptyNote, SectionError, StatTile } from "../ui";
import { AutoRefresh } from "./auto-refresh";

/**
 * Torre de Control · Fiesta — the host's live monitor of the /party labyrinth
 * (players, seals, niches, RSVPs, recent activity; refreshes itself every 10 s)
 * plus the RSVP list. Read-only, admin-gated like every Torre page. Not in the
 * tab strip (one-off event): reached by URL.
 */
export default async function AdminPartyPage() {
  await requireAdmin();
  const [rows, lab] = await Promise.all([fetched(listRsvps()), fetched(labMonitor())]);

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
      <AutoRefresh seconds={10} />
      <LabMonitor lab={lab} />
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

type Monitor = Awaited<ReturnType<typeof labMonitor>>;

/** "hace 3 min" — against the query's own clock, so it's as fresh as the last refresh (10 s). */
function hace(d: Date, ahora: number): string {
  const s = Math.max(0, Math.round((ahora - d.getTime()) / 1000));
  if (s < 60) return "ahora";
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}

/**
 * The live monitor: the group's seals and the next niche, RSVPs, every player
 * and the latest activity. Only what the server knows — a seal is a seal.
 */
function LabMonitor({ lab }: { lab: { ok: true; data: Monitor } | { ok: false } }) {
  if (!lab.ok) {
    return (
      <Card>
        <CardLabel>Laberinto en vivo</CardLabel>
        <SectionError retryHref="/admin/party" />
      </Card>
    );
  }
  const { ahora, total, nichos, rsvp, jugadores, actividad } = lab.data;
  const siguiente = nichos.find((n) => !n.abierto);
  const previo = [...nichos].reverse().find((n) => n.abierto)?.umbral ?? 0;
  return (
    <>
      <Card>
        <div className="flex items-baseline justify-between gap-2">
          <CardLabel>Laberinto en vivo</CardLabel>
          <span className="font-mono text-[10px] tracking-[0.04em] text-text-3">se actualiza solo · 10 s</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile label="Entre todos" value={String(total.entregados)} sub={plural(total.entregados, "sello entregado", "sellos entregados")} />
          <StatTile label="Ganados" value={String(total.ganados)} sub={`${total.ganados - total.entregados} sin entregar`} />
          <StatTile label="Jugadores" value={String(total.jugadores)} sub={`${total.activos} en los últimos 15 min`} />
          <StatTile label="Van" value={String(rsvp.personas)} sub={rsvp.abierta ? `${rsvp.van} sí · ${rsvp.noVan} no` : `confirmar abre con ${rsvp.umbral}`} />
        </div>
        <div className="mt-4">
          <div className="flex items-baseline justify-between gap-2 text-[13px]">
            <span className="text-text">{siguiente ? `Siguiente: ${siguiente.titulo}` : "Todos los nichos abiertos"}</span>
            {siguiente && (
              <span className="font-mono text-[10px] tracking-[0.04em] text-text-2">
                faltan {siguiente.umbral - total.entregados} · {total.entregados}/{siguiente.umbral}
              </span>
            )}
          </div>
          {siguiente && <Bar className="mt-2" pct={((total.entregados - previo) / (siguiente.umbral - previo)) * 100} />}
          <div className="mt-3 flex flex-wrap gap-[6px]">
            {nichos.map((n, i) => (
              <span
                key={n.id}
                className={`rounded-full px-[10px] py-[5px] font-mono text-[10px] tracking-[0.04em] ${n.abierto ? "bg-surface-3 text-completed" : "bg-surface-2 text-text-3"}`}
              >
                {["I", "II", "III", "IV", "V", "VI"][i]} {n.titulo} · {n.abierto ? "abierto" : n.umbral}
              </span>
            ))}
          </div>
        </div>
      </Card>

      <Card>
        <CardLabel>Jugadores</CardLabel>
        {jugadores.length === 0 ? (
          <EmptyNote>Nadie ha entrado al laberinto todavía.</EmptyNote>
        ) : (
          <div className="mt-3 flex flex-col gap-[7px]">
            {jugadores.map((j) => (
              <div key={j.codigo + j.lastSeenAt.getTime()} className="flex items-baseline justify-between gap-2 text-[13px] leading-[1.45]">
                <span className="min-w-0 truncate text-text">
                  {j.apodo ?? "sin apodo"} <span className="font-mono text-[10px] text-text-3">{j.codigo}</span>
                </span>
                <span className={`shrink-0 font-mono text-[10px] tracking-[0.04em] ${j.ganados >= total.porJugador ? "text-completed" : "text-text-2"}`}>
                  {j.ganados} {plural(j.ganados, "sello", "sellos")}
                  {j.ganados > j.entregados ? ` · ${j.ganados - j.entregados} sin entregar` : ""}
                  {j.rsvp ? ` · ${j.rsvp.toUpperCase()}` : ""}
                  {j.ganados >= total.porJugador ? " · TERMINÓ" : ""} · {hace(j.lastSeenAt, ahora)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardLabel>Actividad reciente</CardLabel>
        {actividad.length === 0 ? (
          <EmptyNote>Sin movimiento todavía.</EmptyNote>
        ) : (
          <div className="mt-3 flex flex-col gap-[6px]">
            {actividad.map((e, i) => (
              <div key={i} className="flex items-baseline justify-between gap-2 text-[13px] leading-[1.45]">
                <span className="min-w-0 truncate text-text-2">
                  <span className="text-text">{e.quien}</span> <span className="font-mono text-[10px] text-text-3">{e.codigo}</span> {e.que}
                </span>
                <span className="shrink-0 font-mono text-[10px] tracking-[0.04em] text-text-3">{hace(e.at, ahora)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

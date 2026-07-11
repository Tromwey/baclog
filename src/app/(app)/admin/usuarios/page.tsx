import { fetched, requireAdmin } from "@/modules/admin/guard";
import { getUsuariosMetrics } from "@/modules/admin/metrics";
import { Bar, Card, CardLabel, EmptyNote, SectionError } from "../ui";

/**
 * Usuarios — altas por semana, cohorte fundador (F3.2, 100 asientos), funnel
 * de activación (registro → comparte, el último paso alimenta el gate) y
 * split por país (señal de sesión, la materia prima de ADR-000).
 */
export default async function UsuariosPage() {
  await requireAdmin();
  const metrics = await fetched(getUsuariosMetrics());

  if (!metrics.ok) {
    return (
      <div className="pt-1">
        <Card>
          <CardLabel>Usuarios</CardLabel>
          <SectionError retryHref="/admin/usuarios" />
        </Card>
      </div>
    );
  }

  const m = metrics.data;
  const weekMax = Math.max(...m.weekly.map((w) => w.count), 1);
  const funnelMax = m.funnel[0]?.value || 1;
  // Clamped at 0: steps aren't strict subsets (a card can be shared without a
  // verdict ever being set), so a raw drop can go negative and render "−-50%".
  const drops = m.funnel.map((f, i) =>
    i === 0 || m.funnel[i - 1].value === 0
      ? 0
      : Math.max(0, 1 - f.value / m.funnel[i - 1].value),
  );
  const maxDrop = Math.max(...drops);
  const countryMax = m.countries[0]?.value || 1;

  return (
    <div className="flex flex-col gap-3 pt-1">
      {/* Altas por semana */}
      <Card>
        <div className="flex items-baseline justify-between gap-2">
          <CardLabel>Altas por semana</CardLabel>
          <span className="font-mono text-[10px] tracking-[0.04em] text-text-2">
            {m.totalUsers} total
          </span>
        </div>
        {m.totalUsers === 0 ? (
          <EmptyNote>Aún sin altas registradas. La primera lo cambia todo.</EmptyNote>
        ) : (
          <div className="mt-[15px] flex h-[116px] items-end gap-[6px]">
            {m.weekly.map((w) => (
              <div
                key={w.label}
                className="flex h-full flex-1 flex-col items-center justify-end gap-[7px]"
              >
                <div
                  className={`w-full rounded-t-[5px] ${
                    w.count === weekMax && w.count > 0
                      ? "bg-accent"
                      : "bg-surface-3"
                  }`}
                  style={{
                    height: `${Math.max(3, (w.count / weekMax) * 100).toFixed(0)}%`,
                  }}
                />
                <span className="font-mono text-[8.5px] tracking-[0.02em] text-text-3">
                  {w.label}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Cohorte fundador */}
      <Card>
        <div className="flex items-baseline justify-between gap-2">
          <CardLabel>Cohorte fundador</CardLabel>
          <span className="font-mono text-[11px] text-text-2">
            {m.cohortCurrent} / {m.cohortGoal} lugares
          </span>
        </div>
        <Bar
          className="mt-[13px]"
          fillClass="bg-text-2"
          pct={(m.cohortCurrent / m.cohortGoal) * 100}
        />
        <div className="mt-[10px] text-[12px] leading-[1.4] text-text-3">
          Invitaciones canjeadas de los {m.cohortGoal} asientos iniciales.
        </div>
      </Card>

      {/* Funnel de activación */}
      <Card>
        <CardLabel>Funnel de activación</CardLabel>
        {m.totalUsers === 0 ? (
          <EmptyNote>El funnel se llena cuando llegue el primer usuario.</EmptyNote>
        ) : (
          <>
            <div className="mt-[14px] flex flex-col gap-3">
              {m.funnel.map((step, i) => {
                const last = i === m.funnel.length - 1;
                return (
                  <div key={step.name}>
                    <div className="mb-[6px] flex items-baseline justify-between gap-2">
                      <span className="text-[12.5px] text-text">{step.name}</span>
                      <span className="flex items-baseline gap-[10px]">
                        {i > 0 && (
                          <span
                            className={`font-mono text-[9.5px] tracking-[0.03em] ${
                              drops[i] === maxDrop && maxDrop > 0
                                ? "text-warn"
                                : "text-text-3"
                            }`}
                          >
                            −{Math.round(drops[i] * 100)}%
                          </span>
                        )}
                        <span className="font-mono text-[12px] font-bold text-text">
                          {step.value}
                        </span>
                      </span>
                    </div>
                    <Bar
                      heightClass="h-[7px]"
                      fillClass={last ? "bg-accent" : "bg-text-3"}
                      pct={(step.value / funnelMax) * 100}
                    />
                  </div>
                );
              })}
            </div>
            <div className="mt-[13px] font-mono text-[9.5px] uppercase leading-[1.5] tracking-[0.03em] text-text-3">
              Último paso · <span className="text-accent">comparte</span> ·
              alimenta el gate
            </div>
          </>
        )}
      </Card>

      {/* Usuarios por país */}
      <Card>
        <CardLabel>Usuarios por país</CardLabel>
        {m.countries.length === 0 ? (
          <EmptyNote>Aún sin señal de mercado.</EmptyNote>
        ) : (
          <div className="mt-[14px] flex flex-col gap-[11px]">
            {m.countries.map((c) => (
              <div key={c.name} className="flex items-center gap-[11px]">
                <span className="w-[74px] shrink-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[9.5px] uppercase tracking-[0.02em] text-text-2">
                  {c.name}
                </span>
                <Bar
                  className="flex-1"
                  heightClass="h-[9px]"
                  fillClass="bg-text-2"
                  pct={(c.value / countryMax) * 100}
                />
                <span className="w-[22px] shrink-0 text-right font-mono text-[11px] text-text">
                  {c.value}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="mt-[12px] font-mono text-[9px] uppercase tracking-[0.06em] text-text-3">
          Según señal de sesión (país aproximado)
        </div>
      </Card>
    </div>
  );
}

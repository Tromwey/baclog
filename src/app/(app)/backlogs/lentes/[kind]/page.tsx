import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { ItemRowReadonly } from "@/components/item-row-readonly";
import { Glyph, type GlyphKind } from "@/components/kura/components";
import { plural } from "@/lib/plural";
import { getLensItems, type LensKind } from "@/modules/backlog/lenses";
import { ZoomBackButton } from "../../zoom-back-button";

/**
 * Smart-lens views (HANDOFF §4): auto-generated filters over the whole
 * library, grouped by collection of origin ("de música 2026"…). NOT
 * collections — they never count toward collection totals. The row index
 * RUNS across groups (01,02 | 03,04 | 05). Reachable by URL only.
 *
 * Kura pass (2026-09-24): no identity colour (the portada is the only source
 * of colour — a lens has none), the title in Newsreader 36 lowercase, the
 * state glyph of the system where one exists (llama, check) and none where
 * the system has no glyph for it (en progreso, en el radar).
 */

const LENSES: Record<string, { kind: LensKind; title: string; glyph: GlyphKind | null }> = {
  obsesiones: { kind: "obsessed", title: "me obsesiona", glyph: "obsessed" },
  "en-progreso": { kind: "in_progress", title: "en progreso", glyph: null },
  completados: { kind: "completed", title: "completos", glyph: "completed" },
  "en-el-radar": { kind: "on_my_radar", title: "en el radar", glyph: null },
};

export default async function LensPage({
  params,
}: {
  params: Promise<{ kind: string }>;
}) {
  const { kind } = await params;
  const lens = LENSES[kind];
  if (!lens) notFound();

  const user = await requireUser();
  const groups = await getLensItems(user.id, lens.kind);
  const allItems = groups.flatMap((g) => g.items);
  const hasItems = allItems.length > 0;

  // Index runs across groups (01,02 | 03,04 | 05): each group's rows start
  // after everything the previous groups already numbered.
  const groupStart = new Map<string, number>();
  {
    let acc = 0;
    for (const g of groups) {
      groupStart.set(g.backlogId, acc);
      acc += g.items.length;
    }
  }

  return (
    <main className="relative mx-auto min-h-dvh w-full max-w-md pb-dock-clearance text-text">
      {/* top bar */}
      <div className="relative flex items-center justify-between px-6 pt-[max(64px,calc(20px+env(safe-area-inset-top)))]">
        <ZoomBackButton />
      </div>

      {/* hero */}
      <div className="relative px-5 pt-[22px]">
        <div className="flex items-center gap-2.5">
          {lens.glyph && <Glyph kind={lens.glyph} size={26} />}
          <h1 className="font-brand text-[36px] font-normal leading-[1.02]">{lens.title}</h1>
        </div>
        <p className="mt-2.5 font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">
          {allItems.length} {plural(allItems.length, "título", "títulos")}
          {hasItems &&
            ` · en ${groups.length} ${plural(groups.length, "colección", "colecciones")}`}
        </p>
      </div>

      {hasItems ? (
        <div className="relative mt-3.5">
          {groups.map((group) => (
            <section key={group.backlogId}>
              <h2 className="flex items-center gap-2 px-5 pb-1 pt-4 font-mono text-[11px] uppercase tracking-[0.08em] text-text-3">
                <span>de {group.backlogName}</span>
                <span className="h-px flex-1 bg-line/60" aria-hidden />
              </h2>
              {group.items.map((item, i) => (
                <ItemRowReadonly
                  key={item.backlogItemId}
                  index={(groupStart.get(group.backlogId) ?? 0) + i + 1}
                  catalogItemId={item.catalogItemId}
                  title={item.title}
                  mediaType={item.mediaType}
                  verdict={item.verdict}
                  obsessed={item.obsessed}
                  sourceCrossMediaRecId={item.sourceCrossMediaRecId}
                />
              ))}
            </section>
          ))}
        </div>
      ) : (
        <div className="relative mt-16 px-[30px] text-center">
          <p className="font-brand text-[32px] leading-[1.1]">nada por aquí todavía.</p>
          <p className="mx-auto mt-3 max-w-[30ch] font-sans text-[15px] leading-[1.5] text-text-2">
            Se llena sola con lo que marcas en tus colecciones.
          </p>
        </div>
      )}
    </main>
  );
}

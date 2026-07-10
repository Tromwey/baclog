import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { ItemRowReadonly } from "@/components/item-row-readonly";
import { ThemeColorSync } from "@/components/theme-color-sync";
import { FLAME_PATH, GLYPH_VIEWBOX } from "@/components/glyph-paths";
import { AuraField, LENS_AURAS, type FixedAuraLayer } from "@/components/ui";
import { plural } from "@/lib/plural";
import { getLensItems, type LensKind } from "@/modules/backlog/lenses";
import { ZoomBackButton } from "../../zoom-back-button";

/**
 * Smart-lens views (HANDOFF §4, mocks #p4–#p6): auto-generated filters over
 * the whole library, grouped by shelf of origin ("De Julio '26"…). NOT
 * shelves — they never count toward shelf totals. The row index RUNS across
 * groups (01,02 | 03,04 | 05). The hero aura is the lens's fixed IDENTITY
 * gradient from the mock (lens branding, not content ADN) — always on,
 * unlike shelf auras which stay dark until the first item (§5).
 */

/** Darker scrim (#p6/#p7) vs. the standard hero scrim (#p2/#p4/#p5). */
const SCRIM_DARK =
  "linear-gradient(180deg, rgba(11,11,13,0.18) 0%, rgba(11,11,13,0.12) 45%, #0B0B0D 96%)";
const SCRIM =
  "linear-gradient(180deg, rgba(11,11,13,0.15) 0%, rgba(11,11,13,0.1) 45%, #0B0B0D 96%)";

const LENSES: Record<
  string,
  {
    kind: LensKind;
    title: string;
    icon: React.ReactNode;
    /** Fixed identity gradient (LENS_AURAS preset) + this lens's hero scrim. */
    aura: { layer: FixedAuraLayer; scrim: string };
    /** Dominant identity hue — tints Safari's status-bar band (ThemeColorSync). */
    themeColor: string;
  }
> = {
  obsesiones: {
    kind: "obsessed",
    title: "Me obsesiona",
    icon: (
      <svg
        width="26"
        height="26"
        viewBox={GLYPH_VIEWBOX}
        fill="#FF2D55"
        aria-hidden
      >
        <path d={FLAME_PATH} />
      </svg>
    ),
    aura: { layer: LENS_AURAS.obsesiones, scrim: SCRIM },
    themeColor: "#FF2D55",
  },
  "en-progreso": {
    kind: "in_progress",
    title: "En progreso",
    icon: (
      // Anillo de progreso parcial en lima (mock #p5)
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="9" stroke="#3A3A44" strokeWidth="2.5" />
        <circle
          cx="12"
          cy="12"
          r="9"
          stroke="#D8FF3E"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="56.5"
          strokeDashoffset="21"
          transform="rotate(-90 12 12)"
        />
      </svg>
    ),
    aura: { layer: LENS_AURAS["en-progreso"], scrim: SCRIM },
    themeColor: "#E8B23A",
  },
  completados: {
    kind: "completed",
    title: "Completados",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M4 12l5 5 11-12"
          stroke="#D8FF3E"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    // #p6 is the one lens with the darker scrim (lime is loud).
    aura: { layer: LENS_AURAS.completados, scrim: SCRIM_DARK },
    themeColor: "#D8FF3E",
  },
  "en-el-radar": {
    kind: "on_my_radar",
    title: "En el radar",
    icon: (
      // Blip de radar en azul (--radar)
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="9" stroke="#7AA2FF" strokeWidth="2.5" />
        <circle cx="12" cy="12" r="3.5" fill="#7AA2FF" />
      </svg>
    ),
    aura: { layer: LENS_AURAS["en-el-radar"], scrim: SCRIM },
    themeColor: "#7AA2FF",
  },
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
      {/* Hero light — the lens's fixed identity gradient (branding, always on). */}
      <div className="absolute inset-x-0 top-0 h-[300px] overflow-hidden">
        <ThemeColorSync color={lens.themeColor} />
        <AuraField layers={[lens.aura.layer]} />
        <div
          className="absolute inset-0"
          style={{ background: lens.aura.scrim }}
        />
      </div>

      {/* top bar */}
      <div className="relative flex items-center justify-between px-4 pt-[calc(24px+env(safe-area-inset-top))]">
        <ZoomBackButton />
        <div className="w-[38px]" />
      </div>

      {/* hero */}
      <div className="relative px-5 pt-[22px]">
        <div className="flex items-center gap-[9px]">
          {lens.icon}
          <h1 className="font-display text-[38px] font-extrabold leading-none tracking-[-0.025em] [text-shadow:0_2px_20px_rgba(0,0,0,0.5)]">
            {lens.title}
          </h1>
        </div>
        <p className="mt-2.5 font-mono text-[10px] uppercase tracking-[0.1em] text-text-2">
          {allItems.length} {plural(allItems.length, "ítem", "ítems")}
          {hasItems &&
            ` · en ${groups.length} ${plural(groups.length, "backlog", "backlogs")}`}
        </p>
      </div>

      {hasItems ? (
        <div className="relative mt-3.5">
          {groups.map((group) => (
            <section key={group.backlogId}>
              <h2 className="flex items-center gap-2 px-5 pb-1 pt-4 font-mono text-[9px] uppercase tracking-[0.1em] text-text-3">
                <span>De {group.backlogName}</span>
                <span className="h-px flex-1 bg-line/60" aria-hidden />
              </h2>
              {group.items.map((item, i) => (
                <ItemRowReadonly
                  key={item.backlogItemId}
                  index={(groupStart.get(group.backlogId) ?? 0) + i + 1}
                  catalogItemId={item.catalogItemId}
                  title={item.title}
                  mediaType={item.mediaType}
                  reaction={item.reaction}
                  sourceCrossMediaRecId={item.sourceCrossMediaRecId}
                />
              ))}
            </section>
          ))}
        </div>
      ) : (
        <div className="relative mt-16 px-[30px] text-center">
          <p className="font-serif text-[26px] italic leading-[1.2]">
            Nada por aquí todavía.
          </p>
          <p className="mx-auto mt-3 max-w-[30ch] text-sm leading-[1.55] text-text-2">
            Esta lente se llena sola con lo que marcas en tus backlogs.
          </p>
        </div>
      )}
    </main>
  );
}

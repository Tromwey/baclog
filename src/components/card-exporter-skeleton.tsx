import { SKELETON_PULSE } from "@/components/kura/components";

/**
 * CardExporter's silhouette (card-exporter.tsx), for the share-card routes'
 * loading.tsx: the same h-dvh column, the optional centered header (a mono
 * eyebrow line + a text-xs subtitle line), the 9:16 preview contained in the
 * flexing 340-wide slot — the same `bg-surface-2` / `--r-lg` block the
 * exporter itself shows while its fonts load, so the hand-off is seamless —
 * and the 52 share button. The dock stays (the exporter keeps
 * pb-dock-clearance), so no HideDock. The no-link note is left out: whether
 * it shows depends on data that isn't here yet.
 *
 * `header` mirrors whether the caller passes eyebrow/subtitle (collection and
 * recap do, the item ticket doesn't).
 */
export function CardExporterSkeleton({ header = false }: { header?: boolean }) {
  return (
    <main
      aria-busy="true"
      aria-label="Cargando tarjeta"
      className={`flex h-dvh flex-col items-center bg-bg px-4 pb-dock-clearance pt-5 text-text ${SKELETON_PULSE}`}
    >
      {header && (
        <div className="mb-3 flex shrink-0 flex-col items-center">
          {/* MonoMeta (12/16) on the header's 24 px line box */}
          <span className="flex h-6 items-center">
            <span className="h-3 w-32 rounded-full bg-surface-1" />
          </span>
          {/* subtitle: mt-1, text-xs = 16 px line */}
          <span className="mt-1 flex h-4 items-center">
            <span className="h-2.5 w-44 rounded-full bg-surface-1" />
          </span>
        </div>
      )}

      {/* Contain a 9:16 box in the slot, like the canvas' max-h/max-w-full. */}
      <div className="flex min-h-0 w-full max-w-[340px] flex-1 items-center justify-center [container-type:size]">
        <div
          className="rounded-[var(--r-lg)] bg-surface-2"
          style={{ width: "min(100cqw, 100cqh * 9 / 16)", aspectRatio: "9 / 16" }}
        />
      </div>

      <span className="mt-4 h-[52px] w-full max-w-[340px] shrink-0 rounded-full bg-surface-1" />
    </main>
  );
}

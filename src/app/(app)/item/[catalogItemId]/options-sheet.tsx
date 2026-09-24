"use client";

import { useRouter } from "next/navigation";
import { dismissRecoAction } from "@/app/actions/crossmedia-actions";
import { CHIP_44 } from "@/components/kura/components";
import { SHARE_PATH } from "@/components/glyph-paths";
import { KuraSheet, SheetIcon, SheetRow, useKuraSheetDismiss } from "./kura-sheet";
import { SheetTitleBlock, type SheetWork } from "./sheet-title";
import { useItemReaction } from "./reaction-state";

/**
 * Opciones (···) — the 44 px glass chip at the header's right (64/24), and
 * the floating sheet it opens (O10a pattern). "Todas las acciones secundarias
 * viven en Opciones; la cabecera no lleva fila de botones":
 *
 *  - Compartir — Web Share of the public item URL (F2.19 conversion page),
 *    clipboard where Web Share is missing. Needs a public handle; without one
 *    the row says what to do instead.
 *  - Compartir tarjeta — the ticket export (/item/{id}/card), only for a title
 *    in your collections (the ticket stamps a collection and a state).
 *  - La vi en preestreno — before the release only: the one exception to
 *    "reloj y Completar nunca conviven" (§patrones · aviso de estreno).
 *  - Ocultar recomendación — an AI-sourced title: hides the pairing from
 *    Descubrir for good (dismissRecoAction) and folds the provenance row.
 *  - Quitar de tus colecciones — optimistic, with Deshacer (provider).
 *
 * No "Reportar": the product has no report for a title (only for reviews and
 * profiles).
 */

const TICKET_PATH = "M4 6h16v12H4zM8 10h8M8 14h5";
const PREVIEW_PATH = "M4.5 12.5l4.8 4.8L19.5 7";
const HIDE_PATH =
  "M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.2A9.8 9.8 0 0112 5c5 0 9 4.5 10 7-.5 1.2-1.3 2.5-2.5 3.7M6.2 6.3C4.1 7.7 2.6 9.8 2 12c1 2.5 5 7 10 7 1.6 0 3-.4 4.3-1";
const REMOVE_PATH = "M7 3h10a2 2 0 012 2v16l-7-4-7 4V5a2 2 0 012-2zM9 10h6";

export function OptionsButton() {
  const { openOptions } = useItemReaction();
  return (
    <button type="button" onClick={openOptions} aria-label="Opciones" className={CHIP_44}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <circle cx="5" cy="12" r="2" />
        <circle cx="12" cy="12" r="2" />
        <circle cx="19" cy="12" r="2" />
      </svg>
    </button>
  );
}

export function OptionsSheetHost(props: {
  work: SheetWork;
  publicUrl: string | null;
  upcoming: boolean;
  /** The AI reco this title came from, when the provenance is on the page. */
  recId: string | null;
}) {
  const { optionsOpen, closeOptions } = useItemReaction();
  if (!optionsOpen) return null;
  return (
    <KuraSheet onClose={closeOptions} label="Opciones" className="px-5">
      <OptionsBody {...props} />
    </KuraSheet>
  );
}

function OptionsBody({
  work,
  publicUrl,
  upcoming,
  recId,
}: {
  work: SheetWork;
  publicUrl: string | null;
  upcoming: boolean;
  recId: string | null;
}) {
  const router = useRouter();
  const dismiss = useKuraSheetDismiss();
  const {
    inLibrary,
    recoHidden,
    setRecoHidden,
    openComplete,
    removeFromLibrary,
    showToast,
  } = useItemReaction();

  async function share() {
    dismiss();
    if (!publicUrl) {
      showToast("Elige tu @ y haz público tu perfil en Ajustes para compartir.");
      return;
    }
    // F3.4 — fire-and-forget share signal (keepalive survives navigation).
    fetch("/api/analytics/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventType: "link_share" }),
      keepalive: true,
    }).catch(() => {});
    try {
      if (navigator.share) {
        // URL only, so the target unfurls its own preview (cover hotlinked).
        await navigator.share({ title: `${work.title} · kura`, url: publicUrl });
        return;
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(publicUrl);
      showToast("Link copiado.");
    } catch {
      showToast("No se pudo copiar el link.");
    }
  }

  return (
    <>
      <div className="-mx-2">
        <SheetTitleBlock work={work} />
      </div>
      <SheetRow icon={<SheetIcon d={SHARE_PATH} />} label="Compartir" onClick={share} />
      {inLibrary && (
        <SheetRow
          icon={<SheetIcon d={TICKET_PATH} />}
          label="Compartir tarjeta"
          note="Una imagen con tu estado y la paleta de la portada."
          onClick={() => {
            dismiss();
            router.push(`/item/${work.id}/card`);
          }}
        />
      )}
      {upcoming && (
        <SheetRow
          icon={<SheetIcon d={PREVIEW_PATH} />}
          label="La vi en preestreno"
          note="Completar antes de la fecha de estreno."
          onClick={openComplete}
        />
      )}
      {recId && !recoHidden && (
        <SheetRow
          icon={<SheetIcon d={HIDE_PATH} />}
          label="Ocultar recomendación"
          note="Deja de sugerir esta pareja en Descubrir."
          onClick={() => {
            dismiss();
            setRecoHidden(true);
            void dismissRecoAction(recId);
            showToast("No volverá a aparecer en Descubrir.");
          }}
        />
      )}
      {inLibrary && (
        <SheetRow
          icon={<SheetIcon d={REMOVE_PATH} />}
          label="Quitar de tus colecciones"
          note="También borra tu estado y tu reseña de este título."
          onClick={() => {
            dismiss();
            removeFromLibrary();
          }}
        />
      )}
    </>
  );
}

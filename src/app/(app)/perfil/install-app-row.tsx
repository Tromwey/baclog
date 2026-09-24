"use client";

import { SquareArrowUp, X } from "lucide-react";
import { CHEVRON_RIGHT_PATH } from "@/components/glyph-paths";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Sheet, useSheetDismiss } from "@/components/ui/sheet";

/**
 * "Instalar Kura" — a 52 row of Ajustes (Kura 30a, group "apps"), the
 * accessible install entry point.
 * Platform-aware because PWA install differs wildly:
 *  - Android/desktop Chromium fires `beforeinstallprompt`; we stash it and a tap
 *    triggers the NATIVE one-tap install dialog.
 *  - iOS Safari has NO programmatic install (Apple), so a tap opens an
 *    instruction sheet (Share → Añadir a pantalla de inicio).
 *  - Already running installed (display-mode: standalone) → render nothing.
 *
 * `installed` is read via useSyncExternalStore (server snapshot = false) so
 * there's no setState-in-effect and no hydration mismatch; the deferred prompt
 * is stashed in a ref (no re-render needed — the row shows either way).
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function subscribeInstalled(onChange: () => void) {
  const mq = window.matchMedia("(display-mode: standalone)");
  mq.addEventListener("change", onChange);
  window.addEventListener("appinstalled", onChange);
  return () => {
    mq.removeEventListener("change", onChange);
    window.removeEventListener("appinstalled", onChange);
  };
}
const getInstalledSnapshot = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

export function InstallAppRow({ dividerTop = false }: { dividerTop?: boolean }) {
  const installed = useSyncExternalStore(
    subscribeInstalled,
    getInstalledSnapshot,
    () => false, // server: assume not installed → row renders, then hydrates
  );
  const [sheet, setSheet] = useState<null | "ios" | "manual">(null);
  const deferred = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault(); // suppress Chrome's mini-infobar; the row drives it
      deferred.current = e as BeforeInstallPromptEvent;
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (installed) return null;

  async function onClick() {
    if (deferred.current) {
      await deferred.current.prompt(); // native install dialog (Android/desktop)
      deferred.current = null;
      return;
    }
    const isIOS =
      /iP(hone|ad|od)/.test(navigator.userAgent) ||
      // iPadOS 13+ masquerades as Mac; touch points give it away
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setSheet(isIOS ? "ios" : "manual");
  }

  return (
    <>
      {/* The group's hairline lives here so it disappears with the row. */}
      {dividerTop && <span aria-hidden className="ml-4 block h-px bg-white/[0.06]" />}
      <button
        type="button"
        onClick={onClick}
        className="flex min-h-[52px] w-full items-center gap-3 pl-4 pr-3.5 text-left transition-colors active:bg-white/[0.06]"
      >
        <span className="flex-1 font-sans text-[16px] text-text">Instalar Kura</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-text-2" aria-hidden>
          <path d={CHEVRON_RIGHT_PATH} />
        </svg>
      </button>
      {sheet && (
        <InstructionSheet kind={sheet} onClose={() => setSheet(null)} />
      )}
    </>
  );
}

function InstructionSheet({
  kind,
  onClose,
}: {
  kind: "ios" | "manual";
  onClose: () => void;
}) {
  const steps =
    kind === "ios"
      ? [
          <>
            Toca{" "}
            <span className="inline-flex translate-y-[3px] items-center text-text">
              <SquareArrowUp size={16} strokeWidth={2} />
            </span>{" "}
            <b className="font-semibold text-text">Compartir</b> en la barra de
            Safari.
          </>,
          <>
            Elige <b className="font-semibold text-text">«Agregar a Inicio»</b>.
          </>,
          <>
            Toca <b className="font-semibold text-text">Agregar</b>: Kura vive
            en tu inicio, a pantalla completa.
          </>,
        ]
      : [
          <>
            Abre el menú de tu navegador{" "}
            <b className="font-semibold text-text">(⋮)</b>.
          </>,
          <>
            Elige <b className="font-semibold text-text">«Instalar app»</b> o
            «Agregar a pantalla principal».
          </>,
        ];

  // The app's one sheet (it had drifted into a hand-rolled twin): same glass,
  // same motion, same drag-to-dismiss as every other.
  return (
    <Sheet onClose={onClose} label="Instalar Kura">
      <div className="flex items-start justify-between">
        <h2 className="font-brand text-[22px] leading-[1.1] text-text">
          instalar kura
        </h2>
        <CloseButton />
      </div>
      <p className="mt-1.5 text-[13px] leading-[1.45] text-text-2">
        Se agrega a tu pantalla de inicio como app, sin tiendas ni descargas.
      </p>
      <ol className="mt-4 space-y-3">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--glass-bg)] font-mono text-[12px] text-text">
              {i + 1}
            </span>
            <span className="pt-0.5 text-[15px] leading-[1.5] text-text-2">
              {s}
            </span>
          </li>
        ))}
      </ol>
    </Sheet>
  );
}

/** Inside the <Sheet>, so it can ask for the animated close. */
function CloseButton() {
  const dismiss = useSheetDismiss();
  return (
    <button
      type="button"
      onClick={() => dismiss?.()}
      aria-label="Cerrar"
      className="bl-press-sm -mr-2 -mt-2 flex h-11 w-11 items-center justify-center rounded-full text-text-2 hover:text-text"
    >
      <X size={18} strokeWidth={2} />
    </button>
  );
}

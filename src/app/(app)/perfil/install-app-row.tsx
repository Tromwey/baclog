"use client";

import { ChevronRight, Download, SquareArrowUp, X } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

/**
 * "Instalar app" row for /perfil — the accessible install entry point.
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

export function InstallAppRow({ divider }: { divider?: boolean }) {
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
      <button
        type="button"
        onClick={onClick}
        className={`relative flex w-full items-center gap-[13px] px-[15px] py-[14px] text-left transition-colors hover:bg-white/[0.045] ${
          divider ? "border-b border-white/[0.07]" : ""
        }`}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-white/[0.07] text-text">
          <Download size={17} strokeWidth={1.8} />
        </span>
        <span className="flex-1 font-sans text-[14.5px] font-medium">
          Instalar app
        </span>
        <ChevronRight size={18} className="text-text-3" />
      </button>
      {sheet &&
        createPortal(
          <InstructionSheet kind={sheet} onClose={() => setSheet(null)} />,
          document.body,
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
            <span className="inline-flex translate-y-[3px] items-center text-accent">
              <SquareArrowUp size={16} strokeWidth={2} />
            </span>{" "}
            <b className="font-semibold text-text">Compartir</b> en la barra de
            Safari.
          </>,
          <>
            Elige{" "}
            <b className="font-semibold text-text">
              «Añadir a pantalla de inicio»
            </b>
            .
          </>,
          <>
            Toca <b className="font-semibold text-text">Añadir</b> — Baclog vive
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bl-rise w-full max-w-md rounded-t-[22px] bg-surface-1 p-5 pb-[calc(28px+env(safe-area-inset-bottom))]"
      >
        <div className="flex items-start justify-between">
          <h2 className="font-display text-lg font-bold tracking-[-0.01em]">
            Instalar Baclog
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="-mr-1.5 -mt-1 flex h-8 w-8 items-center justify-center rounded-full text-text-3 transition-colors hover:text-text"
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>
        <p className="mt-1 text-xs text-text-3">
          Se agrega a tu pantalla de inicio como app — sin tiendas, sin
          descargas.
        </p>
        <ol className="mt-4 space-y-3">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent font-mono text-[11px] font-bold text-bg">
                {i + 1}
              </span>
              <span className="pt-0.5 text-sm leading-[1.5] text-text-2">
                {s}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

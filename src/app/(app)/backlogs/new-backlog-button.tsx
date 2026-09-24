"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  createBacklogAction,
  setBacklogVisibilityAction,
  type BacklogVisibility,
} from "@/app/actions/backlog-actions";
import { Sheet, useSheetDismiss } from "@/components/ui";
import { FillIcon, KIcon, PEOPLE_FILL } from "@/components/kura/icons";
import { SHEET_FIELD, SHEET_SOLID, SheetTitle } from "@/components/kura/sheet-parts";
import { PrivacyChoices, VISIBILITY_LABEL } from "./collection-forms";

/**
 * Any "create a collection" entry point: renders the caller's button (the
 * 44 "+" on Tus colecciones, the ghost slot and the glass CTA of 15a) and
 * owns the O2a sheet it opens. The sheet is <Sheet>, portaled to <body>, so
 * it sits ABOVE the dock (AGENTS.md).
 */
export function NewBacklogTrigger({
  className,
  children,
  ariaLabel,
}: {
  className: string;
  children: ReactNode;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={ariaLabel}
        className={className}
      >
        {children}
      </button>
      {open && (
        <Sheet onClose={() => setOpen(false)} label="Nueva colección">
          <NewCollectionBody />
        </Sheet>
      )}
    </>
  );
}

/**
 * O2a: "nueva colección" + close, the name field, "Quién la ve" (swaps the
 * sheet to the K1a choices — one sheet, two steps) and the solid "Crear".
 * New collections are Pública by default (the product's default:
 * is_public AND show_on_profile); anything else is applied right after the
 * create. Lands on the new, empty collection (15d).
 */
function NewCollectionBody() {
  const router = useRouter();
  const dismiss = useSheetDismiss();
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<BacklogVisibility>("featured");
  const [step, setStep] = useState<"form" | "privacy">("form");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFailed(false);
    try {
      const res = await createBacklogAction({ name });
      if (!("id" in res) || !res.id) throw new Error("invalid");
      if (visibility !== "featured") {
        await setBacklogVisibilityAction(res.id, visibility);
      }
      dismiss?.();
      router.push(`/backlogs/${res.id}`);
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  if (step === "privacy") {
    return (
      <div className="flex flex-col gap-1.5">
        <SheetTitle close={false}>quién la ve</SheetTitle>
        <PrivacyChoices
          value={visibility}
          onSelect={(v) => {
            setVisibility(v);
            setStep("form");
          }}
        />
      </div>
    );
  }

  return (
    <form onSubmit={create} className="flex flex-col gap-1.5">
      <SheetTitle>nueva colección</SheetTitle>
      <div className="mt-1.5 flex flex-col gap-3.5">
        <input
          autoFocus
          required
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Nombre de la colección"
          placeholder="Ponle nombre"
          className={SHEET_FIELD}
        />
        <button
          type="button"
          onClick={() => setStep("privacy")}
          className="flex min-h-14 items-center gap-3 px-1 text-left transition-opacity active:opacity-60"
        >
          <FillIcon d={PEOPLE_FILL} size={18} className="text-text" />
          <span className="flex-1 font-sans text-[16px] font-medium text-text">Quién la ve</span>
          <span className="font-sans text-[15px] text-text-2">{VISIBILITY_LABEL[visibility]}</span>
          <KIcon name="chevron" size={16} className="text-text-2" />
        </button>
        {failed && (
          <p className="px-1 font-sans text-[13px] text-text-2">
            No se pudo crear. Revisa tu conexión e inténtalo otra vez.
          </p>
        )}
        <button type="submit" disabled={busy || !name.trim()} className={SHEET_SOLID}>
          {busy ? "Creando…" : "Crear"}
        </button>
      </div>
    </form>
  );
}

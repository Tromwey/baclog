"use client";

import type { BacklogVisibility } from "@/modules/backlog/visibility";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { createBacklogAction } from "@/app/actions/backlog-actions";
import { attempt } from "@/components/kura/attempt";
import { createPartyAction } from "@/app/actions/party-collection-actions";
import { LimitStepper } from "@/components/party/limit-stepper";
import { partyErrorMessage, partyOnboardingPath } from "@/components/party/party-errors";
import { DEFAULT_PER_GUEST_LIMIT } from "@/modules/party-collections/rules";
import { Sheet, useSheetDismiss } from "@/components/ui";
import { FillIcon, KIcon, PEOPLE_FILL } from "@/components/kura/icons";
import { SHEET_FIELD, SHEET_SOLID, SheetTitle } from "@/components/kura/sheet-parts";
import { PrivacyChoices, VISIBILITY_LABEL } from "./collection-forms";
import { COLLECTION_NAME_MAX } from "@/modules/backlog/name-limit";

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
 * is_public AND show_on_profile); the choice travels in the create itself
 * (one write). Lands on the new, empty collection (15d).
 *
 * Colecciones de fiesta (fiesta-app-v2 · create): above the name, the type —
 * Colección | Fiesta ("Cada invitado agrega canciones."). A fiesta has no
 * "Quién la ve" (always private: only its members and whoever holds the
 * link) and instead "Canciones por invitado" (default 3). "Crear fiesta"
 * opens the party with "invita a la fiesta." up.
 */
function NewCollectionBody() {
  const router = useRouter();
  const dismiss = useSheetDismiss();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"collection" | "party">("collection");
  const [limit, setLimit] = useState<number | null>(DEFAULT_PER_GUEST_LIMIT);
  const [visibility, setVisibility] = useState<BacklogVisibility>("featured");
  const [step, setStep] = useState<"form" | "privacy">("form");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  /** A refusal with its own sentence (party: `too_many_parties`, …). */
  const [failMessage, setFailMessage] = useState<string | null>(null);
  /** F2.2 (`onboarding_required`): retrying refuses forever — offer the way out. */
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFailed(false);
    setFailMessage(null);
    setNeedsOnboarding(false);
    try {
      if (kind === "party") {
        const res = await createPartyAction({ name: name.trim(), perGuestLimit: limit });
        if ("ok" in res && res.ok) {
          dismiss?.();
          router.push(`${res.path}?sheet=share`);
          return;
        }
        if ("error" in res && res.error === "signin_required") {
          window.location.assign(res.loginPath);
          return;
        }
        const code = "error" in res ? res.error : "unknown";
        console.error("[party] createPartyAction refused", { error: code });
        setFailMessage(("message" in res && res.message) || partyErrorMessage(code));
        setNeedsOnboarding(code === "onboarding_required");
        setFailed(true);
        setBusy(false);
        return;
      }
      // ONE write: the visibility travels with the create, so "Solo yo" is
      // never public for an instant and a failure leaves nothing to duplicate.
      const res = await attempt(() => createBacklogAction({ name, visibility }));
      if (!res.ok) {
        console.error("[collections] createBacklogAction refused", { error: res.error });
        if (res.error === "invalid") setFailMessage("Ese nombre no es válido. Prueba con otro.");
        setFailed(true);
        setBusy(false);
        return;
      }
      dismiss?.();
      router.push(`/backlogs/${res.value.id}`);
    } catch (err) {
      console.error(`[collections] create ${kind} failed`, err);
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
        <div role="radiogroup" aria-label="Tipo" className="flex flex-col gap-2">
          <KindChoice
            on={kind === "collection"}
            title="Colección"
            description="Agrega series, películas o álbumes."
            onSelect={() => setKind("collection")}
          />
          <KindChoice
            on={kind === "party"}
            title="Fiesta"
            description="Cada invitado agrega canciones."
            onSelect={() => setKind("party")}
          />
        </div>
        <input
          autoFocus
          required
          maxLength={COLLECTION_NAME_MAX}
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label={kind === "party" ? "Nombre de la fiesta" : "Nombre de la colección"}
          placeholder={kind === "party" ? "la fiesta de…" : "nombre de la colección"}
          className={SHEET_FIELD}
        />
        {kind === "party" ? (
          <div className="flex flex-col gap-2">
            <span className="px-1 font-sans text-[14px] font-semibold text-text">Canciones por invitado</span>
            <LimitStepper value={limit} onChange={setLimit} />
          </div>
        ) : (
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
        )}
        <div role="alert" className="flex flex-col gap-2 empty:-mt-3.5">
          {failed && (
            <p className="px-1 font-sans text-[13px] text-text-2">
              {failMessage ?? "No se pudo crear. Revisa tu conexión y vuelve a intentarlo."}
            </p>
          )}
          {failed && needsOnboarding && (
            <button
              type="button"
              onClick={() => {
                dismiss?.();
                router.push(partyOnboardingPath());
              }}
              className="self-start px-1 font-sans text-[14px] font-semibold text-text underline underline-offset-4"
            >
              Terminar
            </button>
          )}
        </div>
        <button type="submit" disabled={busy || !name.trim()} className={SHEET_SOLID}>
          {busy ? "Creando…" : kind === "party" ? "Crear fiesta" : "Crear"}
        </button>
      </div>
    </form>
  );
}

/** Colección | Fiesta: a flat surface that fills in when chosen (no border). */
function KindChoice({
  on,
  title,
  description,
  onSelect,
}: {
  on: boolean;
  title: string;
  description: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onSelect}
      className={`flex flex-col items-start gap-[3px] rounded-[18px] px-4 py-3.5 text-left transition-colors ${
        on ? "bg-white/[0.14]" : "bg-[var(--glass-bg)]"
      }`}
    >
      <span className="font-sans text-[16px] font-semibold text-text">{title}</span>
      <span className="font-sans text-[14px] leading-[1.4] text-text-2">{description}</span>
    </button>
  );
}

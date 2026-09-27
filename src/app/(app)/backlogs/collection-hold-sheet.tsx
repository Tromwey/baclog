"use client";

import type { BacklogVisibility } from "@/modules/backlog/visibility";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setBacklogPinnedAction } from "@/app/actions/backlog-actions";
import { Sheet, useSheetDismiss } from "@/components/ui";
import { MenuGap, MenuRow } from "@/components/kura/sheet-parts";
import {
  CollectionSheetHead,
  DeleteBody,
  PrivacyBody,
  RenameBody,
  ShareBody,
  VISIBILITY_LABEL,
} from "./collection-forms";

/**
 * 9a — mantener el abanico (Colecciones · "Opciones según desde dónde
 * entras", 2026-09-27). One sheet per role: what belongs to the COLLECTION
 * comes out the same from anywhere — Tus colecciones (holding the fan), your
 * own profile (holding a fan) and your public link as its owner (the glass
 * Opciones, 9c). Same rows and order as Opciones in 10b minus the ones that
 * change that screen's view (Ver como lista, Ordenar):
 *
 *   Agregar títulos · Compartir · Fijar/Desfijar · — · Renombrar ·
 *   Privacidad · — · Borrar colección
 *
 * The steps swap the SAME sheet's content — never two sheets at once. Every
 * write is a server action that re-derives ownership (assertOwnsBacklog);
 * this sheet only decides what to offer.
 */

export interface HoldCollection {
  id: string;
  name: string;
  vibe: string | null;
  count: number;
  pinned: boolean;
  visibility: BacklogVisibility;
}

type Step = "menu" | "share" | "rename" | "privacy" | "delete";

export function CollectionHoldSheet({
  collection,
  username,
  profilePublic,
  onClose,
}: {
  collection: HoldCollection;
  username: string | null;
  profilePublic: boolean;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>("menu");
  const [visibility, setVisibility] = useState(collection.visibility);
  const c = collection;
  const label =
    step === "share"
      ? `Compartir ${c.name}`
      : step === "privacy"
        ? `Quién ve ${c.name}`
        : step === "rename"
          ? "Renombrar"
          : step === "delete"
            ? "Borrar colección"
            : `Opciones de ${c.name}`;

  return (
    <Sheet onClose={onClose} label={label} pad={step === "menu" || step === "share" ? "menu" : "form"}>
      {step === "menu" && (
        <HoldMenu collection={c} visibility={visibility} onStep={setStep} />
      )}
      {step === "share" && (
        <ShareBody
          backlogId={c.id}
          name={c.name}
          username={username}
          profilePublic={profilePublic}
          visibility={visibility}
        />
      )}
      {step === "rename" && <RenameBody backlogId={c.id} name={c.name} vibe={c.vibe} />}
      {step === "privacy" && (
        <PrivacyBody backlogId={c.id} name={c.name} value={visibility} onSaved={setVisibility} />
      )}
      {step === "delete" && <DeleteBody backlogId={c.id} name={c.name} count={c.count} />}
    </Sheet>
  );
}

function HoldMenu({
  collection: c,
  visibility,
  onStep,
}: {
  collection: HoldCollection;
  visibility: BacklogVisibility;
  onStep: (step: Exclude<Step, "menu">) => void;
}) {
  const router = useRouter();
  const dismiss = useSheetDismiss();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  function togglePin() {
    setFailed(false);
    startTransition(async () => {
      const res = await setBacklogPinnedAction(c.id, !c.pinned).catch(() => null);
      if (!res || !("ok" in res)) {
        setFailed(true);
        return;
      }
      router.refresh();
      dismiss?.();
    });
  }

  return (
    <div className="flex flex-col gap-0.5">
      <CollectionSheetHead name={c.name} count={c.count} />
      <MenuRow icon="plus" label="Agregar títulos" href={`/descubrir?buscar=1&to=${c.id}`} />
      <MenuRow icon="share" label="Compartir" onClick={() => onStep("share")} />
      <MenuRow
        icon="pin"
        label={c.pinned ? "Desfijar" : "Fijar"}
        aside={c.pinned ? "fijada" : undefined}
        onClick={togglePin}
        disabled={pending}
      />
      <MenuGap />
      <MenuRow icon="pencil" label="Renombrar" onClick={() => onStep("rename")} />
      <MenuRow
        icon="lock"
        label="Privacidad"
        aside={VISIBILITY_LABEL[visibility]}
        onClick={() => onStep("privacy")}
      />
      <MenuGap />
      <MenuRow icon="trash" label="Borrar colección" onClick={() => onStep("delete")} />
      {failed && (
        <p className="px-2.5 pt-1 font-sans text-[13px] text-text-2">
          No se pudo guardar. Revisa tu conexión e inténtalo otra vez.
        </p>
      )}
    </div>
  );
}

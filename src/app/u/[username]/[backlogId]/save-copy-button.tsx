"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveSharedCollectionAction } from "@/app/actions/shared-collection-actions";

const HONEY =
  "inline-flex h-12 items-center rounded-full bg-honey px-6 font-sans text-[16px] font-semibold text-bg bl-press active:bg-honey-press disabled:opacity-60";

/**
 * "Guardar una copia" for a signed-in visitor (Colecciones formalizado · 4a):
 * keeps a private copy of this shared collection in their own library
 * (saveSharedCollectionAction) and opens it. The screen's one honey.
 */
export function SaveCopyButton({ username, backlogId }: { username: string; backlogId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setFailed(false);
            const res = await saveSharedCollectionAction(username, backlogId).catch(() => null);
            if (!res || !("id" in res)) {
              setFailed(true);
              return;
            }
            router.push(`/backlogs/${res.id}`);
          })
        }
        className={HONEY}
      >
        {pending ? "Guardando…" : "Guardar una copia"}
      </button>
      {failed && (
        <span role="status" className="text-[13px] text-text-2">
          No se pudo guardar. Inténtalo otra vez.
        </span>
      )}
    </div>
  );
}

"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { Sheet } from "@/components/ui";
import {
  setBacklogVisibilityAction,
  type BacklogVisibility,
} from "@/app/actions/backlog-actions";
import { plural } from "@/lib/plural";

/**
 * F3.10.1 — the escaparate editor: "Editar" on the profile's Tus backlogs
 * header opens a sheet with every backlog and its three-state visibility
 * (Privado / Público / En tu perfil). One surface for the whole decision the
 * founder described: which shelves are public at all, and which of those get
 * the profile. The mock's own next-prompt asked for the lock on private ones.
 *
 * Optimistic per row, with the FollowButton lesson applied: the action can
 * REJECT (not just return {error}), so both paths revert the row. Closing the
 * sheet after any change refreshes the route so the server-rendered shelves
 * behind it match what was just chosen.
 */

interface EditableBacklog {
  id: string;
  name: string;
  itemCount: number;
  isPublic: boolean;
  showOnProfile: boolean;
}

function visibilityOf(b: {
  isPublic: boolean;
  showOnProfile: boolean;
}): BacklogVisibility {
  if (!b.isPublic) return "private";
  return b.showOnProfile ? "featured" : "public";
}

const STATES: { id: BacklogVisibility; label: string }[] = [
  { id: "private", label: "Privado" },
  { id: "public", label: "Público" },
  { id: "featured", label: "Perfil" },
];

export function EditShelves({ backlogs }: { backlogs: EditableBacklog[] }) {
  const [open, setOpen] = useState(false);
  const [states, setStates] = useState<Record<string, BacklogVisibility>>(() =>
    Object.fromEntries(backlogs.map((b) => [b.id, visibilityOf(b)])),
  );
  const [, startSave] = useTransition();
  const dirty = useRef(false);
  const router = useRouter();

  function setVisibility(backlogId: string, next: BacklogVisibility) {
    const prev = states[backlogId];
    if (prev === next) return;
    setStates((s) => ({ ...s, [backlogId]: next }));
    dirty.current = true;
    startSave(async () => {
      try {
        const result = await setBacklogVisibilityAction(backlogId, next);
        if ("error" in result) {
          setStates((s) => ({ ...s, [backlogId]: prev }));
        }
      } catch {
        setStates((s) => ({ ...s, [backlogId]: prev }));
      }
    });
  }

  function close() {
    setOpen(false);
    // The shelves behind the sheet are server-rendered; one refresh after a
    // real change re-derives them (and the public tree was already
    // revalidated by the action).
    if (dirty.current) {
      dirty.current = false;
      router.refresh();
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-text-3 transition-colors hover:text-text-2"
      >
        Editar
      </button>

      {open && (
        <Sheet onClose={close} label="Editar tus backlogs">
          <div className="font-display text-[18px] font-bold tracking-[-0.01em] text-text">
            ¿Qué se ve de tus backlogs?
          </div>
          <p className="mt-1.5 text-[13px] leading-[1.5] text-pretty text-text-2">
            Privado no existe fuera de tu app. Público vive en su link pero no
            en tu perfil. Perfil es tu escaparate.
          </p>

          <div className="mt-4 flex max-h-[55dvh] flex-col gap-2 overflow-y-auto">
            {backlogs.map((b) => {
              const current = states[b.id];
              return (
                <div
                  key={b.id}
                  className="flex items-center gap-3 rounded-[14px] bg-surface-2 py-[11px] pl-3.5 pr-2.5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      {current === "private" && (
                        <Lock size={11} className="flex-none text-text-3" />
                      )}
                      <span className="truncate text-[13.5px] font-semibold text-text">
                        {b.name}
                      </span>
                    </span>
                    <span className="mt-0.5 block font-mono text-[8.5px] uppercase tracking-[0.1em] text-text-3">
                      {b.itemCount} {plural(b.itemCount, "ítem", "ítems")}
                    </span>
                  </span>
                  <span className="flex flex-none gap-1 rounded-full bg-surface-3 p-[3px]">
                    {STATES.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setVisibility(b.id, s.id)}
                        aria-pressed={current === s.id}
                        className={`rounded-full px-2 py-[6px] font-mono text-[8.5px] uppercase tracking-[0.06em] transition-colors ${
                          current === s.id
                            ? "bg-accent-soft text-accent"
                            : "text-text-3 hover:text-text-2"
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </span>
                </div>
              );
            })}
          </div>

          <p className="mt-3 font-mono text-[8.5px] uppercase tracking-[0.1em] leading-[1.6] text-text-3">
            Lo que hagas con un título (completar, reseñar) sigue las reglas de
            tu cuenta, no del backlog
          </p>
        </Sheet>
      )}
    </>
  );
}

"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { SOLID_BUTTON } from "@/components/kura/components";
import { FanPickRow, NewCollectionRow } from "@/components/kura/fan-row";
import { SaveChip } from "@/components/kura/save-chip";
import { KuraSheet, useKuraSheetDismiss } from "./kura-sheet";
import { SheetTitleBlock, type SheetWork } from "./sheet-title";
import { TriangleGlyph } from "./toast";
import { useItemReaction } from "./reaction-state";
import { saveSheetLabel } from "@/modules/backlog/save-label";
import { COLLECTION_NAME_MAX } from "@/modules/backlog/name-limit";

/**
 * "Guardar" / "En N colecciones" (Kura 24a–d · §patrones · guardar): the
 * ficha's row wears the shared `SaveChip` pill. Reads the live membership off
 * the provider, so it updates the instant a sheet writes.
 */
export function SaveButton() {
  const { memberIds, openSave } = useItemReaction();
  return <SaveChip variant="pill" saved={memberIds.length} onClick={openSave} />;
}

/**
 * 19h "guardar en" — the one way a title enters or leaves collections from the
 * ficha. Floating `--s2` sheet: the title on top, "Nueva colección", every
 * collection with its mini fan and count (Colecciones formalizado · 7a) and a
 * check disc, and the solid action.
 *
 * STAGED: checks are local until the solid action (its label names the change —
 * `saveSheetLabel`: "Guardar en música 2026", "Quitar de…", "Listo") writes the diff
 * (provider `commitMemberships`). Pre-checked with where the title lives; a
 * title that isn't saved anywhere starts on the collection used last ("con la
 * última colección usada marcada"), and with no collections at all the sheet
 * opens on the new-collection field. Unchecking everything reads "Quitar de
 * tus colecciones" and goes through the same Deshacer as Opciones.
 *
 * Pick mode is the same sheet, asked for by Completar on an unsaved title.
 */
export function SaveSheetHost({ work }: { work: SheetWork }) {
  const { saveSheet, closeSave } = useItemReaction();
  if (!saveSheet) return null;
  return (
    <KuraSheet onClose={closeSave} label={`Guardar ${work.title}`}>
      <SaveSheetBody work={work} />
    </KuraSheet>
  );
}

function SaveSheetBody({ work }: { work: SheetWork }) {
  const dismiss = useKuraSheetDismiss();
  const {
    backlogs,
    memberIds,
    collections,
    busy,
    commitMemberships,
    createCollection,
  } = useItemReaction();

  const current = memberIds;
  const wasSaved = current.length > 0;
  const [checked, setChecked] = useState<Set<string>>(() => {
    if (wasSaved) return new Set(current);
    const last =
      (collections.lastUsedBacklogId &&
        backlogs.find((b) => b.id === collections.lastUsedBacklogId)?.id) ||
      backlogs[0]?.id;
    return new Set(last ? [last] : []);
  });
  const [creating, setCreating] = useState(backlogs.length === 0);
  const [newName, setNewName] = useState("");
  const [failed, setFailed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (creating) inputRef.current?.focus();
  }, [creating]);

  const toggle = (id: string) =>
    setChecked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const n = checked.size;
  const unchanged = n === current.length && current.every((id) => checked.has(id));
  const label = busy
    ? "Guardando…"
    : saveSheetLabel(current, checked, (id) => backlogs.find((c) => c.id === id)?.name);

  async function save() {
    if (busy) return;
    if (unchanged) {
      dismiss();
      return;
    }
    setFailed(false);
    const ok = await commitMemberships([...checked]);
    if (ok) dismiss();
    else setFailed(true);
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name || busy) return;
    setFailed(false);
    const made = await createCollection(name);
    if (made) {
      setChecked((s) => new Set(s).add(made.id));
      setNewName("");
      setCreating(false);
    } else {
      setFailed(true);
    }
  }

  return (
    <>
      <SheetTitleBlock work={work} />

      <span className="px-2 pb-1 font-mono text-[11px] uppercase tracking-[0.1em] text-text-2">
        Guardar en
      </span>

      <div className="flex flex-col">
        {creating ? (
          <form onSubmit={create} className="flex min-h-14 items-center gap-2 px-2">
            <input
              ref={inputRef}
              value={newName}
              maxLength={COLLECTION_NAME_MAX}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nombre de la colección"
              aria-label="Nombre de la nueva colección"
              enterKeyHint="done"
              className="h-12 min-w-0 flex-1 rounded-[16px] bg-[var(--glass-bg)] px-4 text-[16px] text-text caret-text outline-none transition-colors placeholder:text-text-3 focus:bg-white/[0.11]"
            />
            <button
              type="submit"
              disabled={busy || !newName.trim()}
              className="inline-flex h-11 flex-none items-center rounded-full bg-[var(--glass-bg)] px-4 text-[15px] font-semibold text-text bl-press hover:bg-white/[0.12] disabled:opacity-40"
            >
              Crear
            </button>
          </form>
        ) : (
          <NewCollectionRow onClick={() => setCreating(true)} />
        )}

        {backlogs.map((b) => {
          const fan = collections.fans[b.id];
          return (
            <FanPickRow
              key={b.id}
              name={b.name}
              covers={fan?.covers ?? []}
              count={fan?.count ?? 0}
              on={checked.has(b.id)}
              onClick={() => toggle(b.id)}
            />
          );
        })}
      </div>

      {failed && (
        <p role="status" className="flex items-center gap-2 px-2 pt-2 text-[14px] text-text-2">
          <TriangleGlyph />
          No se pudo guardar. Revisa tu conexión y vuelve a intentarlo.
        </p>
      )}

      <button
        type="button"
        onClick={save}
        disabled={busy || (n === 0 && !wasSaved)}
        className={`${SOLID_BUTTON} mt-2.5 w-full flex-none`}
      >
        <span className="min-w-0 truncate">{label}</span>
      </button>
    </>
  );
}

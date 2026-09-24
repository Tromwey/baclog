"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { SOLID_BUTTON } from "@/components/kura/components";
import { tintCard } from "@/components/kura/tint";
import { BOOKMARK_PATH, CHECK_FILL_PATH, PLUS_PATH } from "@/components/glyph-paths";
import { plural } from "@/lib/plural";
import { KuraSheet, useKuraSheetDismiss } from "./kura-sheet";
import { SheetTitleBlock, type SheetWork } from "./sheet-title";
import { TriangleGlyph } from "./toast";
import { useItemReaction } from "./reaction-state";

/**
 * "Guardar" / "En N colecciones" (Kura 24a–d · §patrones · guardar): the glass
 * action of the ficha's row. The bookmark is outlined until the title lives in
 * a collection, then filled with the count ("Guardado muestra el marcador
 * lleno con el número de colecciones"). Reads the live membership off the
 * provider, so it updates the instant a sheet writes.
 */
export function SaveButton() {
  const { memberIds, openSave } = useItemReaction();
  const n = memberIds.length;
  return (
    <button
      type="button"
      onClick={openSave}
      className="inline-flex h-11 flex-none items-center gap-2 rounded-full bg-[var(--glass-bg)] pl-3.5 pr-4 text-[15px] font-semibold text-text bl-press hover:bg-white/[0.12]"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill={n > 0 ? "var(--text)" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden className="flex-none">
        <path d={BOOKMARK_PATH} />
      </svg>
      {n === 0 ? "Guardar" : `En ${n} ${plural(n, "colección", "colecciones")}`}
    </button>
  );
}

/**
 * 19h "guardar en" — the one way a title enters or leaves collections from the
 * ficha. Floating `--s2` sheet: the title on top, "Nueva colección", every
 * collection with its newest cover and a check disc, and the solid action.
 *
 * STAGED: checks are local until "Guardar en N colecciones" writes the diff
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
    : n === 0
      ? wasSaved
        ? "Quitar de tus colecciones"
        : "Elige una colección"
      : n === 1
        ? "Guardar en 1 colección"
        : `Guardar en ${n} colecciones`;

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
              maxLength={60}
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
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex min-h-14 items-center gap-3.5 px-2 text-left transition-opacity active:opacity-70"
          >
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[var(--r-cover-s)] bg-[var(--glass-bg)]">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d={PLUS_PATH} />
              </svg>
            </span>
            <span className="flex-1 text-[16px] font-medium">Nueva colección</span>
          </button>
        )}

        {backlogs.map((b) => {
          const on = checked.has(b.id);
          const thumb = collections.thumbs[b.id];
          return (
            <button
              key={b.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(b.id)}
              className="flex min-h-14 items-center gap-3.5 px-2 text-left transition-opacity active:opacity-70"
            >
              <span
                aria-hidden
                className="relative h-10 w-10 flex-none overflow-hidden rounded-[var(--r-cover-s)] bg-[var(--glass-bg)]"
                style={thumb && !thumb.posterUrl ? { background: tintCard(thumb.paletteHex ?? []) } : undefined}
              >
                {thumb?.posterUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- hotlinked external CDN (ADR-007)
                  <img src={thumb.posterUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                )}
              </span>
              <span className="min-w-0 flex-1 truncate font-serif text-[19px]">{b.name}</span>
              <span
                className={`flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full transition-colors ${
                  on ? "bg-white/[0.2]" : "bg-[var(--glass-bg)]"
                }`}
              >
                <svg width={14} height={14} viewBox="0 0 24 24" fill={on ? "var(--text)" : "transparent"} aria-hidden>
                  <path d={CHECK_FILL_PATH} />
                </svg>
              </span>
            </button>
          );
        })}
      </div>

      {failed && (
        <p role="status" className="flex items-center gap-2 px-2 pt-2 text-[14px] text-text-2">
          <TriangleGlyph />
          No se guardó. Revisa tu conexión y vuelve a intentarlo.
        </p>
      )}

      <button
        type="button"
        onClick={save}
        disabled={busy || (n === 0 && !wasSaved)}
        className={`${SOLID_BUTTON} mt-2.5 w-full flex-none`}
      >
        {label}
      </button>
    </>
  );
}

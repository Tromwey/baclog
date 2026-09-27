/**
 * The action of the "guardar en" sheet (19h) says the CHANGE, not the state
 * (critique 2026-09-27: with only "ya está" checked it read "Guardar en 1
 * colección" though nothing new would be saved). Plain module: the ficha's
 * sheet (`item/[id]/add-to-backlog.tsx`) and Descubrir's (`descubrir/
 * save-sheet.tsx`) share it. Twin of the iOS "Guardar en" sheet.
 *
 * - nothing changed → "Listo" (closes)
 * - only additions → "Guardar en {name}" / "Guardar en N colecciones"
 * - only removals, still somewhere → "Quitar de {name}" / "Quitar de N colecciones"
 * - everything unchecked → "Quitar de tus colecciones" (was saved) or
 *   "Elige una colección" (wasn't; the button is off)
 * - both → "Guardar cambios"
 */
export function saveSheetLabel(
  current: readonly string[],
  checked: ReadonlySet<string>,
  nameOf: (id: string) => string | undefined,
): string {
  const was = new Set(current);
  const added = [...checked].filter((id) => !was.has(id));
  const removed = current.filter((id) => !checked.has(id));
  if (checked.size === 0) return current.length > 0 ? "Quitar de tus colecciones" : "Elige una colección";
  if (added.length === 0 && removed.length === 0) return "Listo";
  if (removed.length === 0) return added.length === 1 ? `Guardar en ${nameOf(added[0]) ?? "1 colección"}` : `Guardar en ${added.length} colecciones`;
  if (added.length === 0) return removed.length === 1 ? `Quitar de ${nameOf(removed[0]) ?? "1 colección"}` : `Quitar de ${removed.length} colecciones`;
  return "Guardar cambios";
}

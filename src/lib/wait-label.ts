/**
 * A known wait, as the copy says it ("45 s", "3 min" — `copy-unificado.md`,
 * Tabla A `{tiempo}`). Minutes round UP: the number shown is never shorter
 * than the real wait.
 */
export function waitLabel(seconds: number): string {
  const s = Math.max(1, Math.ceil(seconds));
  return s < 60 ? `${s} s` : `${Math.ceil(s / 60)} min`;
}

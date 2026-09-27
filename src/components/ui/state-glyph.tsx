import { CHECK_PATH, FLAME_PATH, LIKE_PATH } from "@/components/glyph-paths";

/**
 * The state of a title as a GLYPH, never a dot (Revamp UI, 2026-09-03 — "Estados
 * como glifos, nunca puntos"). Four states, four marks, the mock's hues:
 *
 *  - obsessed  → flame, hot (fill)
 *  - liked     → thumb up, radar (fill)
 *  (no "disliked": "no le gusta" doesn't exist in kura — founder 2026-09-27.
 *  An old `disliked` verdict reads as done if completed, else nothing.)
 *  - done      → check, salvia `--completed` (STROKE 3.4)
 *
 * The same glyph appears on a cover's corner (13px), in a review's byline
 * (10–11px) and inside a segmented control (10–11px), so the size travels as a
 * prop. Server-safe.
 */
export type StateKind = "obsessed" | "liked" | "done";

/** The mock draws each state at a slightly different optical size. */
const DEFAULT_SIZE: Record<StateKind, number> = {
  obsessed: 10,
  liked: 11,
  done: 11,
};

export function StateGlyph({
  kind,
  size,
  className = "",
}: {
  kind: StateKind;
  size?: number;
  className?: string;
}) {
  const s = size ?? DEFAULT_SIZE[kind];
  if (kind === "done") {
    return (
      <svg
        width={s}
        height={s}
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--completed)"
        strokeWidth={3.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`flex-none ${className}`}
        aria-hidden
      >
        <path d={CHECK_PATH} />
      </svg>
    );
  }
  const fill =
    kind === "obsessed" ? "var(--hot)" : "var(--radar)";
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill={fill}
      className={`flex-none ${className}`}
      aria-hidden
    >
      <path d={kind === "obsessed" ? FLAME_PATH : LIKE_PATH} />
    </svg>
  );
}

/**
 * The one state a title shows on a cover corner, from its per-title state:
 * obsession wins, then a liked verdict, then completion. An old `disliked`
 * verdict has no glyph of its own (it falls through to done / nothing).
 * `isPublic` is kept for callers on cross-user surfaces; it no longer
 * changes the answer.
 */
export function coverState(
  {
    obsessed,
    verdict,
    status,
  }: {
    obsessed: boolean;
    verdict: "liked" | "disliked" | null;
    status?: string | null;
  },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _opts: { isPublic?: boolean } = {},
): StateKind | null {
  if (obsessed) return "obsessed";
  if (verdict === "liked") return "liked";
  if (status === "completed") return "done";
  return null;
}

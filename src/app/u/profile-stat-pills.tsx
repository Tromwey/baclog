import { StateGlyph } from "@/components/ui";

/**
 * The three stat pills under a profile's handle (Revamp UI 09/10,
 * 2026-09-03): me gustó · obsesión · completado, each a glass pill (7/12
 * padding, mono 11 at .06em, NOT uppercase — it's a number) with the state
 * glyph at 11px. Same three counts whether it's your profile or someone
 * else's public one.
 */
const PILL =
  "inline-flex items-center gap-[7px] rounded-full bg-[var(--glass-bg)] px-3 py-[7px] font-mono text-[11px] tracking-[0.06em] text-text";

export function ProfileStatPills({
  counts,
  className = "",
}: {
  counts: { liked: number; obsessed: number; completed: number };
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      <span className={PILL} aria-label={`${counts.liked} me gustó`}>
        <StateGlyph kind="liked" size={11} />
        {counts.liked}
      </span>
      <span className={PILL} aria-label={`${counts.obsessed} obsesiones`}>
        <StateGlyph kind="obsessed" size={11} />
        {counts.obsessed}
      </span>
      <span className={PILL} aria-label={`${counts.completed} completados`}>
        <StateGlyph kind="done" size={11} />
        {counts.completed}
      </span>
    </div>
  );
}

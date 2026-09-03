/**
 * The light behind a profile (Revamp UI screens 09/10, 2026-09-03): the
 * mock's `marielGlow` / `danGlow` — a 115° gradient of three palette hexes
 * with the middle stop at 50% (own profile) or 55% (public), .55, blur 90,
 * hanging off the top edge — and over it the 420px overlay that lifts the
 * top-right corner and fades everything into the page background. Both are
 * `absolute`, so the caller's root must be `relative` and the content must
 * sit in its own `relative` layer above.
 */
export function ProfileBackdrop({
  palette,
  midStop,
}: {
  palette: readonly string[];
  /** 50 on /perfil, 55 on /u/[username] — the mock's two recipes. */
  midStop: 50 | 55;
}) {
  // Pad to three stops by repeating what there is (a single hex still glows).
  const p = palette.length > 0 ? palette : ["#D8FF3E"];
  const [a, b, c] = [p[0], p[1] ?? p[0], p[2] ?? p[1] ?? p[0]];
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-[60px] -top-[120px] h-[480px] opacity-55"
        style={{
          background: `linear-gradient(115deg, ${a} 0%, ${b} ${midStop}%, ${c} 100%)`,
          filter: "blur(90px)",
          transform: "translateZ(0)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px]"
        style={{
          background:
            "radial-gradient(120% 80% at 80% 0%, rgba(255,255,255,.12), transparent 60%), linear-gradient(rgba(11,11,13,0) 45%, var(--bg))",
        }}
      />
    </>
  );
}

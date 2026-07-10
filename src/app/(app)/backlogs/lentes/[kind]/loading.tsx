/**
 * Lens skeleton — the lens page's silhouette (‹ back · icon+title hero · a few
 * rows) shown while getLensItems streams in. Mirrors the real page's paddings
 * so the swap doesn't jump; transparent bg keeps the app-wide aura visible.
 * One shared pulse (opacity only) — no spinners (item loading.tsx idiom).
 */
export default function Loading() {
  return (
    <main className="relative mx-auto min-h-dvh w-full max-w-md pb-dock-clearance">
      <div className="animate-pulse">
        {/* top bar silhouette: ‹ back chip */}
        <div className="flex items-center justify-between px-4 pt-[calc(24px+env(safe-area-inset-top))]">
          <div className="h-[38px] w-[38px] rounded-full bg-surface-1" />
        </div>

        {/* hero: icon + title, then the meta line */}
        <div className="px-5 pt-[22px]">
          <div className="flex items-center gap-[9px]">
            <div className="h-[26px] w-[26px] rounded-full bg-surface-1" />
            <div className="h-[38px] w-1/2 rounded-xl bg-surface-1" />
          </div>
          <div className="mt-2.5 h-2.5 w-2/5 rounded-full bg-surface-1" />
        </div>

        {/* a few item-row bars */}
        <div className="mt-6">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex h-[58px] items-center gap-3 px-5">
              <div className="h-3 w-[18px] rounded bg-surface-1" />
              <div className="h-4 flex-1 rounded-full bg-surface-1" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

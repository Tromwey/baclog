import { SKELETON_PULSE } from "@/components/kura/components";
import { Fan } from "@/components/kura/fan";

/**
 * Shared collection skeleton (page.tsx · Colecciones formalizado 4a) — the
 * kura lockup and Entrar at 64, the ghost fan at 225, the owner row (seal 24
 * · "una colección de @handle"), the Newsreader 36 name, the meta, the honey
 * CTA's and the share chip's places, then a first run of three columns. Its
 * own boundary so it doesn't inherit the public profile's skeleton.
 */
export default function Loading() {
  return (
    <div aria-busy="true" className="relative mx-auto min-h-dvh w-full max-w-md overflow-x-clip bg-bg">
      <div className={SKELETON_PULSE}>
        <div className="flex items-center justify-between px-6 pt-[calc(64px+env(safe-area-inset-top))]">
          <div className="flex h-11 items-center">
            <div className="h-[22px] w-20 rounded-full bg-surface-1" />
          </div>
          <div className="h-11 w-[84px] rounded-full bg-surface-1" />
        </div>
        <div className="flex flex-col items-center gap-2.5 px-6 pb-[26px] pt-[22px]">
          <Fan covers={[]} lead={225} ghost />
          <div className="mt-1 flex items-center gap-2">
            <div className="h-6 w-6 rounded-full bg-surface-1" />
            <div className="h-3.5 w-36 rounded-full bg-surface-1" />
          </div>
          <div className="h-9 w-3/5 rounded-lg bg-surface-2" />
          <div className="h-3 w-40 rounded-full bg-surface-1" />
          <div className="mt-2.5 flex gap-2">
            <div className="h-12 w-[168px] rounded-full bg-surface-1" />
            <div className="h-11 w-11 rounded-full bg-surface-1" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-x-3 px-5 pb-14">
          {["aspect-[2/3]", "aspect-square", "aspect-[2/3]"].map((a, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <div className={`${a} rounded-[var(--r-cover-l)] bg-surface-1`} />
              <div className="flex h-4 items-center">
                <div className="h-3 w-4/5 rounded-full bg-surface-1" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

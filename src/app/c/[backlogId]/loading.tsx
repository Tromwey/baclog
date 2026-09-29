import { SKELETON_PULSE } from "@/components/kura/components";
import { PartyHeroSkeleton, SongRowsSkeleton } from "@/components/party/party-parts";

/** fiesta-app-v2 · loading, for the member page. */
export default function PartyLoading() {
  return (
    <main className="relative mx-auto min-h-dvh w-full max-w-md bg-bg pt-[calc(60px+env(safe-area-inset-top))] text-text" aria-busy>
      <PartyHeroSkeleton pulse={SKELETON_PULSE} />
      <div className="px-2 pt-9">
        <SongRowsSkeleton pulse={SKELETON_PULSE} />
      </div>
    </main>
  );
}

import { SKELETON_PULSE, Wordmark } from "@/components/kura/components";
import { PartyHeroSkeleton, SongRowsSkeleton } from "@/components/party/party-parts";

/** fiesta-app-v2 · loading: the empty fan, three bars, five rows. */
export default function InviteLoading() {
  return (
    <main className="relative mx-auto min-h-dvh w-full max-w-md bg-bg text-text" aria-busy>
      <header className="mt-1 flex h-14 items-center px-5 pt-[env(safe-area-inset-top)]">
        <Wordmark variant="C" />
      </header>
      <PartyHeroSkeleton pulse={SKELETON_PULSE} />
      <div className="px-2 pt-9">
        <SongRowsSkeleton pulse={SKELETON_PULSE} />
      </div>
    </main>
  );
}

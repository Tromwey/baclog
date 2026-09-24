import { requireUser } from "@/auth";
import { BackButton } from "@/components/ui";
import { MusicPicker } from "./music-picker";

/**
 * 30b Abrir música en (Kura, flujo 11) — one choice, radio list in one `--s1`
 * group of 52 rows, and the note that says what it changes.
 */
export default async function MusicaPage() {
  const user = await requireUser();
  return (
    <main className="mx-auto min-h-dvh w-full max-w-md bg-bg pb-dock-clearance text-text">
      <div className="px-6 pt-[calc(16px+env(safe-area-inset-top))]">
        <BackButton href="/settings" className="h-11! w-11!" />
      </div>
      <div className="flex flex-col gap-7 px-4 pt-4">
        <h1 className="mx-2 font-brand text-[36px] leading-[1.02] text-text">abrir música en</h1>
        <MusicPicker initial={user.preferredService} />
      </div>
    </main>
  );
}

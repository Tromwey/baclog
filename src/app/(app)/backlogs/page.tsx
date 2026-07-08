import { requireUser } from "@/auth";
import { getBacklogsForUser } from "@/modules/backlog/queries";
import { NewBacklogButton } from "./new-backlog-button";
import { BacklogShelves, type Shelf } from "./backlog-shelves";

export default async function BacklogsPage() {
  const user = await requireUser();
  const list = await getBacklogsForUser(user.id);
  const shelves: Shelf[] = list.map((b) => ({
    id: b.id,
    name: b.name,
    itemCount: b.itemCount,
    paletteHex: b.paletteHex,
    items: b.items,
  }));

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md pb-dock-clearance text-text">
      <header className="flex items-start justify-between gap-3.5 px-[22px] pb-[26px] pt-[calc(56px+env(safe-area-inset-top))]">
        <div>
          <h1 className="font-display text-[30px] font-extrabold leading-[1.02] tracking-[-0.02em]">
            Tus backlogs
          </h1>
          <p className="mt-2.5 max-w-[30ch] text-[13.5px] leading-[1.5] text-text-2">
            Tus colecciones vivas. Cada estante respira el ADN de lo que guardas.
          </p>
        </div>
        <NewBacklogButton />
      </header>

      {list.length === 0 ? (
        <div className="mt-8 px-[22px] text-center">
          <p className="font-serif text-xl italic text-text-2">
            Todavía no tienes backlogs.
          </p>
          <p className="mt-2 text-sm text-text-3">
            Crea el primero y empieza a coleccionar obsesiones.
          </p>
        </div>
      ) : (
        <BacklogShelves shelves={shelves} />
      )}
    </main>
  );
}

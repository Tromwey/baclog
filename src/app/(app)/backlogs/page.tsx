import Link from "next/link";
import { requireUser } from "@/auth";
import { getBacklogsForUser } from "@/modules/backlog/queries";
import { NewBacklogButton } from "./new-backlog-button";

export default async function BacklogsPage() {
  const user = await requireUser();
  const list = await getBacklogsForUser(user.id);

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md bg-neutral-950 px-4 pb-16 pt-8 text-neutral-100">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Tus backlogs</h1>
        <NewBacklogButton />
      </header>

      {list.length === 0 ? (
        <div className="mt-20 text-center">
          <p className="text-neutral-400">Todavía no tienes backlogs.</p>
          <p className="mt-1 text-sm text-neutral-500">
            Crea el primero y empieza a coleccionar obsesiones.
          </p>
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-3">
          {list.map((b) => (
            <Link
              key={b.id}
              href={`/backlogs/${b.id}`}
              className="rounded-2xl bg-neutral-900 p-3 hover:bg-neutral-800"
            >
              <div className="grid aspect-square grid-cols-2 gap-1 overflow-hidden rounded-xl bg-neutral-800">
                {b.coverUrls.length > 0 ? (
                  b.coverUrls.map((url, i) => (
                    // eslint-disable-next-line @next/next/no-img-element -- hotlinked external CDN (ADR-007)
                    <img
                      key={i}
                      src={url}
                      alt=""
                      className={`h-full w-full object-cover ${
                        b.coverUrls.length === 1 ? "col-span-2 row-span-2" : ""
                      }`}
                      loading="lazy"
                    />
                  ))
                ) : (
                  <div className="col-span-2 row-span-2 flex items-center justify-center text-2xl text-neutral-600">
                    ✦
                  </div>
                )}
              </div>
              <p className="mt-2 truncate font-semibold">{b.name}</p>
              <p className="text-xs text-neutral-500">
                {b.itemCount} {b.itemCount === 1 ? "ítem" : "ítems"}
                {b.vibe ? ` · ${b.vibe}` : ""}
              </p>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}

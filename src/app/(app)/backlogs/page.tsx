import Link from "next/link";
import { Sparkles } from "lucide-react";
import { requireUser } from "@/auth";
import { getBacklogsForUser } from "@/modules/backlog/queries";
import { NewBacklogButton } from "./new-backlog-button";

export default async function BacklogsPage() {
  const user = await requireUser();
  const list = await getBacklogsForUser(user.id);

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md bg-bg px-4 pb-16 pt-8 text-text">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold tracking-[-0.01em]">
          Tus backlogs
        </h1>
        <NewBacklogButton />
      </header>

      {list.length === 0 ? (
        <div className="mt-20 text-center">
          <p className="font-serif text-xl italic text-text-2">
            Todavía no tienes backlogs.
          </p>
          <p className="mt-2 text-sm text-text-3">
            Crea el primero y empieza a coleccionar obsesiones.
          </p>
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-3">
          {list.map((b) => (
            <Link
              key={b.id}
              href={`/backlogs/${b.id}`}
              className="rounded-[var(--r-lg)] border border-line bg-surface-1 p-3 transition-colors hover:bg-surface-2"
            >
              <div className="grid aspect-square grid-cols-2 gap-1 overflow-hidden rounded-[var(--r-md)] bg-surface-2">
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
                  <div className="col-span-2 row-span-2 flex items-center justify-center text-text-3">
                    <Sparkles size={24} />
                  </div>
                )}
              </div>
              <p className="mt-2 truncate font-semibold text-text">{b.name}</p>
              <p className="text-xs text-text-3">
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

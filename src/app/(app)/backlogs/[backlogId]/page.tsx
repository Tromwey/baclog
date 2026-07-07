import Link from "next/link";
import { notFound } from "next/navigation";
import { NotFoundError, UnauthorizedError, assertOwnsBacklog } from "@/authz";
import { deriveEras } from "@/modules/backlog/era";
import { getBacklogItems } from "@/modules/backlog/queries";
import { BacklogMenu } from "./backlog-menu";
import { ItemRow } from "./item-row";

export default async function BacklogDetailPage({
  params,
}: {
  params: Promise<{ backlogId: string }>;
}) {
  const { backlogId } = await params;
  let backlog;
  try {
    ({ backlog } = await assertOwnsBacklog(backlogId));
  } catch (err) {
    if (err instanceof NotFoundError || err instanceof UnauthorizedError) {
      notFound();
    }
    throw err;
  }

  const items = await getBacklogItems(backlog.id);
  const eras = deriveEras(items);

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md bg-bg px-4 pb-16 pt-6 text-text">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold">{backlog.name}</h1>
          <p className="text-sm text-text-3">
            {items.length} {items.length === 1 ? "ítem" : "ítems"}
            {backlog.vibe ? ` · ${backlog.vibe}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {items.length > 0 && (
            <Link
              href={`/backlogs/${backlog.id}/card`}
              className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-bg"
            >
              Tarjeta
            </Link>
          )}
          <BacklogMenu backlogId={backlog.id} currentName={backlog.name} />
        </div>
      </header>

      {items.length === 0 ? (
        <div className="mt-16 text-center">
          <p className="text-text-2">Este backlog está vacío.</p>
          <Link
            href="/search"
            className="mt-3 inline-block rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-bg"
          >
            Buscar algo que agregar
          </Link>
        </div>
      ) : (
        <div className="mt-4 space-y-6">
          {eras.map((era) => (
            <section key={era.key}>
              <h2 className="mb-2 font-mono text-xs font-bold uppercase tracking-widest text-text-3">
                {era.label}
              </h2>
              <div className="space-y-2">
                {era.items.map((item) => (
                  <ItemRow key={item.id} item={item} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}

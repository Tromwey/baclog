import Link from "next/link";
import { requireUser } from "@/auth";
import { buildLatestRecap } from "@/modules/backlog/recap";
import { CardGenerator } from "@/app/(app)/backlogs/[backlogId]/card/card-generator";

export default async function RecapPage() {
  const user = await requireUser();
  const recap = await buildLatestRecap(user.id, user.username);

  if (!recap) {
    return (
      <main className="mx-auto min-h-dvh w-full max-w-md bg-neutral-950 px-4 pb-16 pt-8 text-neutral-100">
        <h1 className="text-xl font-bold">Tu recap</h1>
        <div className="mt-16 text-center">
          <p className="text-neutral-400">Todavía no hay nada que recapitular.</p>
          <p className="mt-1 text-sm text-neutral-500">
            Agrega ítems y marca estados — tu era del mes aparece aquí.
          </p>
          <Link
            href="/search"
            className="mt-4 inline-block rounded-full bg-neutral-100 px-5 py-2.5 text-sm font-semibold text-neutral-900"
          >
            Buscar algo que agregar
          </Link>
        </div>
      </main>
    );
  }

  return (
    <div className="bg-neutral-950">
      <div className="mx-auto w-full max-w-md px-4 pt-8 text-center text-neutral-100">
        <p className="font-mono text-xs font-bold uppercase tracking-widest text-amber-300">
          ✦ Tu {recap.label}
        </p>
        <p className="mt-1 text-sm text-neutral-400">
          {recap.totalItems} obsesiones · {recap.completedCount} completadas
          {recap.topGenre ? ` · ${recap.topGenre}` : ""}
        </p>
      </div>
      {/* Reuses the exact M2 card generator (receipt/ticket/pattern + share) */}
      <CardGenerator
        backlog={recap.cardBacklog}
        publicUrl={
          user.username && user.isPublic
            ? `https://baclog.app/${user.username}`
            : null
        }
      />
    </div>
  );
}

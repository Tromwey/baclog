import Link from "next/link";
import { requireUser } from "@/auth";

/** Placeholder until G3 (backlog CRUD) lands — proves the auth gate works. */
export default async function BacklogsPage() {
  const user = await requireUser();
  return (
    <main className="mx-auto min-h-dvh w-full max-w-md bg-neutral-950 px-4 pb-16 pt-8 text-neutral-100">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Hola, {user.name}</h1>
        <Link href="/settings" className="text-sm text-neutral-400 underline">
          Ajustes
        </Link>
      </header>
      <p className="mt-12 text-center text-neutral-500">
        Tus backlogs vivirán aquí (G3 en construcción).
      </p>
    </main>
  );
}

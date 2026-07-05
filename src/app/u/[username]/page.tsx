import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicProfile } from "@/modules/backlog/public";

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const profile = await getPublicProfile((await params).username);
  if (!profile) return {};
  return {
    title: `${profile.displayName} · Baclog`,
    description: `Los backlogs de ${profile.displayName} — películas, series y música.`,
    openGraph: {
      title: `${profile.displayName} en Baclog`,
      description: `${profile.backlogs.length} backlogs de obsesiones.`,
      type: "profile",
    },
  };
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const profile = await getPublicProfile(username);
  // Private and nonexistent are identical 404s — no enumeration oracle
  if (!profile) notFound();

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md bg-neutral-950 px-4 pb-20 pt-10 text-neutral-100">
      <header className="text-center">
        <p className="font-mono text-xs font-bold tracking-[0.35em] text-neutral-500">
          BACLOG
        </p>
        <h1 className="mt-3 text-2xl font-bold">{profile.displayName}</h1>
        <p className="text-sm text-neutral-400">@{profile.username}</p>
      </header>

      <div className="mt-8 grid grid-cols-2 gap-3">
        {profile.backlogs.map((b) => (
          <Link
            key={b.id}
            href={`/u/${profile.username}/${b.id}`}
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
            </p>
          </Link>
        ))}
      </div>

      <footer className="mt-12 text-center">
        <Link
          href="/login"
          className="inline-block rounded-full bg-neutral-100 px-6 py-3 font-semibold text-neutral-900"
        >
          Crea tu Baclog
        </Link>
      </footer>
    </main>
  );
}

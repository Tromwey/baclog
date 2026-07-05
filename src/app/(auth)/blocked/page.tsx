export default function BlockedPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-neutral-950 px-6 text-center text-neutral-100">
      <h1 className="font-mono text-2xl font-bold tracking-[0.35em]">BACLOG</h1>
      <p className="mt-8 max-w-xs text-neutral-300">
        Necesitas tener al menos 13 años para usar Baclog.
      </p>
      <p className="mt-2 max-w-xs text-sm text-neutral-500">
        No guardamos nada más de ti.
      </p>
    </main>
  );
}

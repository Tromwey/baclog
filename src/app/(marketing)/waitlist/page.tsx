import { Suspense } from "react";
import { WaitlistForm } from "./waitlist-form";

export const metadata = {
  title: "Baclog — lista de espera",
  description: "Tus obsesiones, en una tarjeta. Apártate un lugar.",
};

export default function WaitlistPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-bg px-6 text-text">
      <div className="w-full max-w-sm text-center">
        <h1 className="font-mono text-2xl font-bold tracking-[0.35em]">BACLOG</h1>
        <p className="mt-3 text-text-2">
          Películas, series y música que amas — en una tarjeta que se comparte.
        </p>
        <p className="mt-1 text-sm text-text-3">
          Apártate un lugar. Invita gente y sube en la fila.
        </p>
        <Suspense>
          <WaitlistForm />
        </Suspense>
      </div>
    </main>
  );
}

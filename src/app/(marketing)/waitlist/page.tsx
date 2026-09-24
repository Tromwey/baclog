import { Suspense } from "react";
import { Wordmark } from "@/app/u/kura/components";
import { WaitlistForm } from "./waitlist-form";

export const metadata = {
  title: "Kura · lista de espera",
  description: "Guarda lo que más vale: películas, series y música, en colecciones. Apártate un lugar.",
};

/**
 * Kura · the pre-launch door. The design system's own opening line as the
 * title ("guarda lo que más vale."), the product in one sentence, the form.
 * Public surface (`.kura` scope).
 */
export default function WaitlistPage() {
  return (
    <main className="kura relative mx-auto flex min-h-lvh w-full max-w-md flex-col bg-bg px-6 pb-11 text-text">
      <header className="flex items-center pt-[calc(64px+env(safe-area-inset-top))]">
        <Wordmark size={30} />
      </header>
      <div className="mt-[62px] flex flex-col gap-3">
        <h1 className="font-brand text-[40px] leading-none text-text text-balance">
          guarda lo que más vale.
        </h1>
        <p className="text-[15px] leading-[1.5] text-text-2 text-pretty">
          Películas, series y música en colecciones, y lo que obsesiona a tu
          gente. Apártate un lugar: invita gente y sube en la fila.
        </p>
        <Suspense>
          <WaitlistForm />
        </Suspense>
      </div>
    </main>
  );
}

import { Wordmark } from "@/components/kura/components";

/** Kura · the age gate. A fact and a note, no wink (§voz · errores). */
export default function BlockedPage() {
  return (
    <main className="kura relative mx-auto flex min-h-lvh w-full max-w-md flex-col bg-bg px-6 pb-11 text-text">
      <header className="flex items-center pt-[calc(64px+env(safe-area-inset-top))]">
        <Wordmark size={30} />
      </header>
      <div className="mt-[62px] flex flex-col gap-3">
        <h1 className="font-brand text-[40px] leading-none text-text text-balance">
          necesitas tener 13 años para usar kura.
        </h1>
        <p className="text-[15px] leading-[1.5] text-text-2">
          No guardamos nada más de ti.
        </p>
      </div>
    </main>
  );
}

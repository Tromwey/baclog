import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Wordmark } from "@/components/kura/components";
import {
  INTRO,
  PRIVACY_EFFECTIVE_DATE,
  PRIVACY_HAS_PLACEHOLDERS,
  SECTIONS,
  type Block,
  type DataItem,
  type Rich,
} from "./content";

export const metadata: Metadata = {
  title: "aviso de privacidad · kura",
  description:
    "Qué datos guarda Kura, para qué, quién los ve, con quién se comparten y cómo los borras.",
};

/**
 * /privacidad — the aviso de privacidad integral (LFPDPPP) and the privacy
 * policy URL App Store Connect asks for. Public, no session, server-only.
 * Same shell as /creditos (`.kura` scope, wordmark at 64, Newsreader title at
 * 40, Hanken 15 body); the text itself lives in ./content.ts so it can be
 * reviewed without touching layout. Borderless: the data inventory is flat
 * `surface-1` groups with content hairlines between entries.
 */
export default function PrivacidadPage() {
  // Never publish the aviso with founder placeholders still in it.
  if (PRIVACY_HAS_PLACEHOLDERS) notFound();
  return (
    <main className="kura relative mx-auto flex min-h-lvh w-full max-w-md flex-col bg-bg px-6 pb-16 text-text">
      <header className="flex items-center pt-[calc(64px+env(safe-area-inset-top))]">
        <Wordmark size={30} />
      </header>

      <div className="mt-[62px] flex flex-col gap-3">
        <h1 className="font-brand text-[40px] leading-none text-text text-balance">
          aviso de privacidad.
        </h1>
        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-3">
          vigente desde el {PRIVACY_EFFECTIVE_DATE}
        </p>
        {INTRO.map((p, i) => (
          <p key={i} className="text-[15px] leading-[1.55] text-text-2 text-pretty">
            <RichText value={p} />
          </p>
        ))}
      </div>

      <nav aria-label="Contenido" className="mt-8 flex flex-col gap-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-3">en esta página</span>
        <ol className="flex flex-col">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="flex min-h-9 items-center text-[15px] text-text-2 transition-[color,opacity] hover:text-text active:opacity-60"
              >
                {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-10 flex flex-col gap-10 text-[15px] leading-[1.55] text-text-2">
        {SECTIONS.map((s) => (
          <section key={s.id} id={s.id} className="flex scroll-mt-6 flex-col gap-3">
            <h2 className="font-brand text-[24px] leading-[1.1] text-text">{s.title}</h2>
            {s.blocks.map((b, i) => (
              <BlockView key={i} block={b} />
            ))}
          </section>
        ))}
      </div>
    </main>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case "p":
      return (
        <p className="text-pretty">
          <RichText value={block.text} />
        </p>
      );
    case "list":
      return (
        <ul className="flex flex-col gap-2 pl-4">
          {block.items.map((item, i) => (
            <li key={i} className="list-disc text-pretty marker:text-text-3">
              <RichText value={item} />
            </li>
          ))}
        </ul>
      );
    case "data":
      return (
        <div className="flex flex-col overflow-hidden rounded-[var(--r-surface)] bg-surface-1">
          {block.items.map((item, i) => (
            <DataEntry key={item.name} item={item} first={i === 0} />
          ))}
        </div>
      );
  }
}

function DataEntry({ item, first }: { item: DataItem; first: boolean }) {
  return (
    <div className="flex flex-col">
      {!first && <span aria-hidden className="ml-4 h-px bg-white/[0.06]" />}
      <div className="flex flex-col gap-2 px-4 py-4">
        <h3 className="text-[16px] font-semibold leading-[1.3] text-text">{item.name}</h3>
        <p className="text-pretty">
          <RichText value={item.what} />
        </p>
        <dl className="flex flex-col gap-2">
          <Field label="para qué" value={item.why} />
          <Field label="quién lo ve" value={item.seen} />
          <Field label="cuánto tiempo" value={item.kept} />
        </dl>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: Rich }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-3">{label}</dt>
      <dd className="text-pretty">
        <RichText value={value} />
      </dd>
    </div>
  );
}

function RichText({ value }: { value: Rich }) {
  if (typeof value === "string") return <>{value}</>;
  return (
    <>
      {value.map((part, i) =>
        typeof part === "string" ? (
          <span key={i}>{part}</span>
        ) : (
          <a
            key={i}
            href={part.href}
            className="text-text underline decoration-text-3 underline-offset-[3px] transition-opacity active:opacity-60"
          >
            {part.text}
          </a>
        ),
      )}
    </>
  );
}

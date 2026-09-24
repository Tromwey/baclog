import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { MediaType } from "@/modules/catalog/types";
import { posterFallbackStyle } from "@/components/cover-tile";
import {
  BACK_PATH,
  BOOKMARK_PATH,
  CHECK_FILL_PATH,
  CLOCK_PATH,
  FLAME_PATH,
  LIKE_PATH,
  REVIEW_PATH,
  USERS_PATH,
} from "@/components/glyph-paths";
import { sealColors, tintCard } from "./tint";

/**
 * The Kura primitives of the PUBLIC surfaces (design/kura/sistema-de-diseno
 * .dc.html §componentes). Server-safe — no hooks — so /u/* stays a set of
 * server components; anything that needs state (the share chip, the report
 * sheet, the format filter) is its own client file next to its page.
 *
 * Borderless, glow-free, pulse-free (HANDOFF §7 and §principios 01: "la
 * portada es la única fuente de color").
 */

/* ---------------------------------------------------------------- marca */

/** The wordmark (§marca · A). `size` in px; the caller places it. */
export function Wordmark({ size = 30, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`kura-wordmark text-text ${className}`} style={{ fontSize: size }}>
      kura
    </span>
  );
}

/**
 * The web header of every public page (flujos-v2 · 12 web): the kanji beside
 * the wordmark at 22, left, and a glass "Abrir app" pill at the right. There
 * is no store listing yet, so the pill leads into the account flow and says
 * so honestly ("Entrar"); swap the label and href when the app ships.
 */
export function BrandLockup() {
  return (
    <Link href="/" aria-label="kura" className="flex h-11 items-center gap-1.5 text-text">
      <span className="font-brand text-[22px] leading-none">蔵</span>
      <span className="kura-wordmark" style={{ fontSize: 22, lineHeight: 1 }}>
        kura
      </span>
    </Link>
  );
}

export function EnterPill({ label = "Entrar", href = "/login" }: { label?: string; href?: string }) {
  return (
    <Link
      href={href}
      className="inline-flex h-11 items-center rounded-full bg-[var(--glass-bg)] px-[18px] font-sans text-[15px] font-semibold text-text bl-press hover:bg-white/[0.12]"
    >
      {label}
    </Link>
  );
}

/* --------------------------------------------------------------- glifos */

export type GlyphKind =
  | "obsessed"
  | "liked"
  | "completed"
  | "waiting"
  | "saved"
  | "review"
  | "users";

const GLYPH: Record<GlyphKind, { d: string; color: string }> = {
  obsessed: { d: FLAME_PATH, color: "var(--st-obsessed)" },
  liked: { d: LIKE_PATH, color: "var(--st-liked)" },
  completed: { d: CHECK_FILL_PATH, color: "var(--st-completed)" },
  waiting: { d: CLOCK_PATH, color: "var(--st-waiting)" },
  saved: { d: BOOKMARK_PATH, color: "var(--text)" },
  review: { d: REVIEW_PATH, color: "var(--text)" },
  users: { d: USERS_PATH, color: "var(--text)" },
};

/** One glyph, one meaning (§glifos). Fill on the 24×24 grid. */
export function Glyph({
  kind,
  size = 13,
  className = "",
}: {
  kind: GlyphKind;
  size?: number;
  className?: string;
}) {
  const g = GLYPH[kind];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={g.color}
      className={`flex-none ${className}`}
      aria-hidden
    >
      <path d={g.d} />
    </svg>
  );
}

/** The state of a public title as the glyph vocabulary reads it. */
export function stateGlyph(item: {
  obsessed: boolean | null;
  status: string | null;
  verdict: string | null;
}): GlyphKind | null {
  if (item.obsessed) return "obsessed";
  if (item.status === "completed") return item.verdict === "liked" ? "liked" : "completed";
  return null;
}

/* ------------------------------------------------------------- botones */

/** Volver / Opciones: 44 px, glass, no border (§componentes · icono y texto). */
export const CHIP_44 =
  "flex h-11 w-11 flex-none items-center justify-center rounded-full bg-[var(--glass-bg)] text-text bl-press-sm hover:bg-white/[0.12]";

export function BackChip({ href, label = "Volver" }: { href: string; label?: string }) {
  return (
    <Link href={href} aria-label={label} className={CHIP_44}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={BACK_PATH} />
      </svg>
    </Link>
  );
}

/** Sólido: the action that closes a flow (Guardar, Crear, Entrar). */
export const SOLID_BUTTON =
  "inline-flex h-[52px] items-center justify-center gap-2 rounded-full bg-text px-5 font-sans text-[16px] font-semibold text-bg bl-press disabled:opacity-40 disabled:pointer-events-none";
/** Vidrio: screen actions, filters, Reintentar. */
export const GLASS_BUTTON =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[var(--glass-bg)] px-4 font-sans text-[15px] font-semibold text-text bl-press hover:bg-white/[0.12]";
/** Miel: Seguir — once per screen (§color: "El miel aparece una vez por pantalla"). */
export const HONEY_BUTTON =
  "inline-flex h-11 items-center justify-center rounded-full bg-honey px-5 font-sans text-[15px] font-semibold text-bg bl-press active:bg-honey-press";
/** The text field: glass, radius 16, 52 tall (O1b/O1c). */
export const FIELD =
  "h-[52px] w-full rounded-[16px] bg-[var(--glass-bg)] px-[18px] font-sans text-[16px] text-text outline-none placeholder:text-text-3 transition-colors focus:bg-white/[0.11]";

/* ----------------------------------------------------------------- texto */

/** Section title: Newsreader 24, lowercase, with an optional mono aside. */
export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="font-brand text-[24px] leading-[1.1] text-text">{children}</h2>
      {aside && <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">{aside}</span>}
    </div>
  );
}

/**
 * The data voice: Red Hat Mono 11, uppercase, +8% tracking. `upper={false}`
 * for identifiers (a @handle is not a label and keeps its case).
 */
export function Mono({
  children,
  upper = true,
  className = "",
}: {
  children: ReactNode;
  upper?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`font-mono text-[11px] text-text-2 ${upper ? "uppercase tracking-[0.08em]" : "tracking-[0.04em]"} ${className}`}
    >
      {children}
    </span>
  );
}

/* ----------------------------------------------------------------- sello */

/**
 * The seal or the photo (§marca · avatar). `hexes` = the owner's dominant
 * palette (light tone first); with a photo the disc simply shows it.
 */
export function Seal({
  name,
  hexes,
  src,
  size,
  className = "",
}: {
  name: string;
  hexes: readonly string[];
  src?: string | null;
  size: number;
  className?: string;
}) {
  const { bg, fg } = sealColors(hexes);
  const initials = name
    .trim()
    .replace(/^@/, "")
    .split(/[\s._-]+/)
    .filter(Boolean);
  const a = Array.from(initials[0] ?? "·")[0] ?? "·";
  const b =
    initials.length > 1
      ? Array.from(initials[initials.length - 1])[0] ?? ""
      : Array.from(initials[0] ?? "")[1] ?? "";
  return (
    <span
      aria-hidden
      className={`kura-seal flex flex-none items-center justify-center overflow-hidden rounded-full ${className}`}
      style={{ width: size, height: size, background: bg, color: fg, fontSize: Math.round(size * 0.42) }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- our own /api/avatar route
        <img src={src} alt="" draggable={false} className="h-full w-full object-cover" />
      ) : (
        `${a}${b}`.toLowerCase()
      )}
    </span>
  );
}

/* ---------------------------------------------------------------- ribbon */

/** Ribbon (§StatusPill · Ribbon): glyph 12–14 + mono count, one per state. */
export function CountRibbon({
  counts,
  className = "",
}: {
  counts: { kind: GlyphKind; n: number; label: string }[];
  className?: string;
}) {
  const shown = counts.filter((c) => c.n > 0);
  if (shown.length === 0) return null;
  return (
    <div
      role="img"
      aria-label={shown.map((c) => `${c.n} ${c.label}`).join(", ")}
      className={`flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 ${className}`}
    >
      {shown.map((c) => (
        <span key={c.kind} className="inline-flex items-center gap-[5px] font-mono text-[12px] text-text-2">
          <Glyph kind={c.kind} size={14} />
          {formatCount(c.n)}
        </span>
      ))}
    </div>
  );
}

/** "12,4 k" past a thousand, the plain number below (the mock's ribbon). */
export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${(k >= 10 ? Math.round(k) : Math.round(k * 10) / 10).toString().replace(".", ",")} k`;
}

/** The "en kura" pills' thousands: "1.2 mil", "21 mil", "318" (29a). */
export function formatMil(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k >= 10 ? Math.round(k) : Math.round(k * 10) / 10} mil`;
}

/* --------------------------------------------------------------- portada */

/** Native aspect per kind (§forma): disco 1:1, póster 2:3. */
export function aspectOf(mediaType: MediaType): string {
  return mediaType === "album" ? "aspect-square" : "aspect-[2/3]";
}

/**
 * A cover with its shadow, the palette recipe when there is no art, and — top
 * left — either the state glyph in a 26 px `--glass-art` disc or the wait pill
 * (§StatusPill · Cuadrícula).
 */
export function Cover({
  posterUrl,
  paletteHex,
  mediaType,
  alt = "",
  glyph = null,
  wait = null,
  radius = "rounded-[var(--r-cover-l)]",
  className = "",
  style,
}: {
  posterUrl: string | null;
  paletteHex?: readonly string[] | null;
  mediaType: MediaType;
  alt?: string;
  glyph?: GlyphKind | null;
  /** "16 oct" / "3 d" — wins over `glyph`. */
  wait?: string | null;
  radius?: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={`relative block flex-none overflow-hidden bg-surface-2 shadow-cover ${radius} ${aspectOf(mediaType)} ${className}`}
      style={{ ...(posterUrl ? undefined : posterFallbackStyle(paletteHex)), ...style }}
    >
      {posterUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- hotlinked external CDN (ADR-007)
        <img src={posterUrl} alt={alt} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
      )}
      {wait ? (
        <span className="absolute left-1.5 top-1.5 inline-flex h-[26px] items-center gap-[5px] rounded-full bg-glass-art pl-[7px] pr-[9px] font-mono text-[11px] uppercase leading-none tracking-[0.04em] text-text backdrop-blur-[14px]">
          <Glyph kind="waiting" size={13} />
          {wait}
        </span>
      ) : glyph ? (
        <span className="absolute left-1.5 top-1.5 flex h-[26px] w-[26px] items-center justify-center rounded-full bg-glass-art backdrop-blur-[14px]">
          <Glyph kind={glyph} size={13} />
        </span>
      ) : null}
    </span>
  );
}

/* ---------------------------------------------------- card de colección */

export interface CardCover {
  posterUrl: string | null;
  paletteHex: readonly string[] | null;
  mediaType: MediaType;
  title?: string;
  glyph?: GlyphKind | null;
  wait?: string | null;
}

/**
 * The collection card (§componentes · card de colección): a 40 px spine with
 * the name set vertically in mono, and every cover at the SAME height aligned
 * to the base — 150 on the pinned card, 120 on the compact ones — the width
 * following the format. Tinted by its palette. The whole card slides
 * horizontally when the covers overflow.
 */
export function CollectionCard({
  name,
  covers,
  paletteHex,
  height = 120,
  href,
  tag,
  glyph,
  emptyLabel,
  className = "",
}: {
  name: string;
  covers: CardCover[];
  paletteHex: readonly string[];
  /** 150 pinned · 120 compact · 104 on the web profile (33a). */
  height?: 150 | 120 | 104;
  href?: string;
  /** "auto" on the automatic collection. */
  tag?: string;
  /** Privacy glyph in the corner (personas · candado). */
  glyph?: ReactNode;
  emptyLabel?: string;
  className?: string;
}) {
  const body = (
    <span
      className="relative flex w-full overflow-hidden rounded-[var(--r-screen)]"
      style={{ background: covers.length ? tintCard(paletteHex) : "var(--surface-1)" }}
    >
      <span className="flex w-10 flex-none items-center justify-center bg-black/[0.24]">
        <span
          className="whitespace-nowrap font-mono tracking-[0.14em] text-text"
          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", maxHeight: height + 26, fontSize: height >= 150 ? 13 : 11 }}
        >
          {name}
        </span>
      </span>
      <span
        className="bl-scroll flex flex-1 items-end gap-2.5 overflow-x-auto pl-3.5 pr-3.5"
        style={{ paddingTop: tag ? 44 : height >= 150 ? 20 : 16, paddingBottom: height >= 150 ? 20 : 16 }}
      >
        {covers.length === 0 && (
          <span className="flex items-center justify-center rounded-[var(--r-cover-l)] bg-[var(--glass-bg)] text-text-3" style={{ height, width: Math.round(height * 2 / 3) }}>
            <span className="font-mono text-[10px] uppercase tracking-[0.08em]">{emptyLabel ?? "vacía"}</span>
          </span>
        )}
        {covers.map((c, i) => (
          <Cover
            key={i}
            posterUrl={c.posterUrl}
            paletteHex={c.paletteHex}
            mediaType={c.mediaType}
            alt={c.title ?? ""}
            glyph={c.glyph ?? null}
            wait={c.wait ?? null}
            style={{ height }}
          />
        ))}
        <span className="w-0.5 flex-none" />
      </span>
      {tag && (
        <span className="absolute left-14 top-3 rounded-full bg-glass-art px-[9px] py-[5px] font-mono text-[10px] uppercase tracking-[0.08em] text-text-2">
          {tag}
        </span>
      )}
      {glyph && <span className="absolute right-3 top-3 text-text">{glyph}</span>}
    </span>
  );
  if (href) {
    return (
      <Link href={href} className={`block bl-press-lg ${className}`}>
        {body}
      </Link>
    );
  }
  return <div className={className}>{body}</div>;
}

/* --------------------------------------------------------- llamada web */

/**
 * The way in for someone without the app (flujos-v2 · 12 web): a `--s1`
 * card at the end of the page — the system's opening line in Newsreader 26,
 * one sentence, the solid "Crear cuenta" and the quiet "Ya tengo cuenta".
 * Not fixed, not honey: miel stays reserved for Seguir.
 */
export function CtaCard({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex flex-col items-center gap-3 rounded-[var(--r-screen)] bg-surface-1 px-5 py-7 text-center ${className}`}
    >
      <span className="font-brand text-[26px] leading-[1.1] text-text text-balance">guarda lo que más vale.</span>
      <span className="text-[15px] leading-[1.5] text-text-2 text-pretty">
        Tus películas, series y música en un solo lugar, y lo que obsesiona a tu gente.
      </span>
      <Link
        href="/login"
        className="mt-1.5 inline-flex h-12 items-center rounded-full bg-text px-6 font-sans text-[16px] font-semibold text-bg bl-press"
      >
        Crear cuenta
      </Link>
      <Link href="/login" className="flex min-h-11 items-center text-[15px] font-medium text-text-2 transition-colors hover:text-text">
        Ya tengo cuenta
      </Link>
    </div>
  );
}

/** The mono "créditos" footer link every public page carries. */
export function CreditsLink({ className = "" }: { className?: string }) {
  return (
    <p className={`text-center ${className}`}>
      <Link href="/creditos" className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-3 transition-colors hover:text-text-2">
        créditos
      </Link>
    </p>
  );
}

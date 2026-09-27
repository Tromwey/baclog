import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Shared plumbing for the link-preview images (`opengraph-image.tsx`, rendered
 * by `next/og` · Satori). Server-only: it reads font files off disk and
 * fetches remote covers.
 *
 * FONTS — Satori needs the raw TTF bytes (no woff2, no variable fonts), so the
 * Kura families live as static cuts in `assets/fonts/og/` (copied from the iOS
 * bundle, OFL — `ios/` is excluded from the Vercel upload, so it can't be read
 * at runtime). The path is a literal `join(process.cwd(), …)` on purpose:
 * that is the form Next's output tracing follows (opengraph-image.md).
 *
 * COVERS — hotlinked CDN art (ADR-007) is fetched HERE, with a timeout and a
 * size cap, and handed to Satori as a data URI; anything that fails (slow
 * CDN, 404, a format Satori can't decode) returns null and the caller paints
 * the palette recipe instead. Never let Satori fetch a remote `src` itself:
 * it has no timeout and one dead CDN would hang the whole preview.
 */

type OgFont = {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 500 | 600;
  style: "normal" | "italic";
};

const FONT_DIR = join(process.cwd(), "assets/fonts/og");

const FILES: { file: string; name: string; weight: OgFont["weight"]; style: OgFont["style"] }[] = [
  { file: "Newsreader-Regular.ttf", name: "Newsreader", weight: 400, style: "normal" },
  { file: "Newsreader-Italic.ttf", name: "Newsreader", weight: 400, style: "italic" },
  { file: "Newsreader-MediumItalic.ttf", name: "Newsreader", weight: 500, style: "italic" },
  { file: "HankenGrotesk-Regular.ttf", name: "Hanken", weight: 400, style: "normal" },
  { file: "HankenGrotesk-SemiBold.ttf", name: "Hanken", weight: 600, style: "normal" },
  { file: "RedHatMono-Regular.ttf", name: "RedHatMono", weight: 400, style: "normal" },
];

let fontsPromise: Promise<OgFont[]> | null = null;

/** The Kura cuts the previews use, read once per server instance. */
export function loadOgFonts(): Promise<OgFont[]> {
  fontsPromise ??= Promise.all(
    FILES.map(async ({ file, ...meta }) => {
      const buf = await readFile(join(FONT_DIR, file));
      return { ...meta, data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer };
    }),
  ).catch((err) => {
    fontsPromise = null; // don't pin a transient failure for the instance's life
    throw err;
  });
  return fontsPromise;
}

const COVER_TIMEOUT_MS = 2500;
const COVER_MAX_BYTES = 1_500_000;
const DECODABLE = new Set(["image/jpeg", "image/png"]);

/** A remote cover as a data URI Satori can draw, or null (→ palette fallback). */
export async function coverDataUri(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    const res = await fetch(u, { signal: AbortSignal.timeout(COVER_TIMEOUT_MS), cache: "no-store" });
    if (!res.ok) return null;
    const type = res.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
    if (!DECODABLE.has(type)) return null;
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > COVER_MAX_BYTES) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > COVER_MAX_BYTES) return null;
    return `data:${type};base64,${Buffer.from(buf).toString("base64")}`;
  } catch {
    return null;
  }
}

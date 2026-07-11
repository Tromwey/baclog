import "server-only";

/**
 * Deterministic moderation gate for LLM-authored cross-media narratives.
 *
 * WHY THIS EXISTS: cross_media_rec is a SHARED, PERMANENT cache — a narrative
 * generated once for one user is served verbatim to every user who ever gets
 * that pairing, forever, with no human review. A single bad generation (an
 * offensive line, or a successful injection via a manipulated TMDB title —
 * TMDB is publicly editable) would be persisted and broadcast. This module is
 * the last deterministic check before the insert: it screens the LLM-authored
 * fields and, on rejection, the caller refunds the meter and persists NOTHING.
 *
 * PHILOSOPHY (asymmetric costs):
 *   - A FALSE NEGATIVE is tolerable: one weird narrative slips through; it can
 *     be purged later and the blocklist grows one entry.
 *   - A FALSE POSITIVE is expensive: the pairing can NEVER be cached (the same
 *     deterministic check rejects every regeneration), so a benign word on the
 *     list permanently kills real recos. Spanish is a minefield here — "negro"
 *     is a color, "Kike" is a common nickname for Enrique, "puñal" is a dagger,
 *     "marica" is a Colombian colloquialism, "coon" lives inside "Maine Coon".
 *     None of those go on the list.
 *   Therefore the blocklist is SHORT and every term is unambiguous: slurs and
 *   group-directed insults with no benign mainstream use. Tone-policing is the
 *   prompt's job, not this gate's — Gen Z coloquialismos suaves (and even
 *   vulgarity not aimed at a group, e.g. "de puta madre") PASS. Reclaimed
 *   variants that appear in real catalog titles (e.g. "nigga" in rap album
 *   titles that hookEyebrow legitimately quotes) also PASS; only the
 *   hard-r/unambiguous forms are listed.
 *
 * PILAR 4: fully local, deterministic, no network, no third parties.
 */

/**
 * Normalize for matching: lowercase + strip diacritics, so "MARICÓN" and
 * "maricón" both hit "maricon". Deterministic, locale-independent.
 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Curated blocklist — es + en slurs and group-directed insults ONLY, matched
 * on word boundaries over normalized (lowercase, diacritic-free) text. Every
 * entry must have NO benign mainstream use; when in doubt, leave it out (see
 * the false-positive philosophy above). Multi-word entries match as phrases.
 */
const BLOCKLIST: string[] = [
  // --- español: slurs / insultos dirigidos a grupo (sin uso benigno) ---
  "maricon", // "marica" (coloquial CO) y "puñal" (daga) quedan FUERA
  "joto",
  "sudaca",
  "mongolico",
  "subnormal",
  "malparido",
  "hijo de puta", // "puta" sola queda fuera: "de puta madre" es coloquial
  "hija de puta",
  "negro de mierda", // "negro" solo es un color — NUNCA listarlo suelto
  "indio de mierda",
  "india de mierda",
  "pinche indio",
  "pinche india",
  "retrasado mental", // "retrasado" solo = vuelo retrasado (benigno)
  "retrasada mental",
  "suicidate",
  // --- english: unambiguous slurs / targeted abuse ---
  "nigger", // "nigga" queda FUERA: aparece en títulos reales de rap que
  // hookEyebrow cita legítimamente (falso positivo permanente)
  "faggot", // "fag" queda fuera (slang británico: cigarro)
  "wetback",
  "cunt",
  "whore",
  "slut",
  "retarded",
  "tranny",
  "kill yourself",
  "kys",
];

/**
 * Word-boundary regexes over normalized text. `\b` is ASCII-only in JS, so we
 * use letter/number lookarounds — after normalize() the text may still carry
 * non-ASCII letters (ñ, CJK) and they must count as word characters.
 */
const BLOCKLIST_PATTERNS: RegExp[] = BLOCKLIST.map(
  (term) =>
    new RegExp(
      `(?<![\\p{L}\\p{N}])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`,
      "u",
    ),
);

/**
 * Artifacts that betray broken output or a successful injection: a card
 * narrative never legitimately contains a URL, an email, a raw JSON/markdown
 * block, or meta-instructions aimed at the model. Matched on the RAW field
 * (URLs/emails are case-preserved) and the normalized one for prose markers.
 */
const ARTIFACT_CHECKS: { pattern: RegExp; reason: string }[] = [
  { pattern: /https?:\/\//i, reason: "url artifact" },
  { pattern: /\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/i, reason: "email artifact" },
  { pattern: /```/, reason: "markdown code-fence artifact" },
  { pattern: /\{\s*"/, reason: "raw JSON artifact" },
  { pattern: /<\/?system\b/i, reason: "system-tag artifact" },
  { pattern: /system prompt/i, reason: "prompt-leak artifact" },
  // "instrucciones" o "reglas anteriores" — nunca "reglas" a secas: "un disco
  // que ignora las reglas del género" es crítica musical legítima.
  { pattern: /ignora\s+(todas\s+las\s+|las\s+)?(instrucciones|reglas\s+anteriores)/i, reason: "injection artifact (es)" },
  { pattern: /ignore\s+(all\s+)?(previous\s+|prior\s+)?(rules|instructions)/i, reason: "injection artifact (en)" },
  { pattern: /como modelo de lenguaje/i, reason: "model-disclaimer artifact" },
  { pattern: /as an ai language model/i, reason: "model-disclaimer artifact" },
];

/**
 * Shape sanity — belt over the provider's own clamps (longest clamp today is
 * 300 chars/field): a field this big means the clamps were bypassed or the
 * output is garbage either way.
 */
const MAX_FIELD_CHARS = 400;
const MAX_TOTAL_CHARS = 1000;

export type ScreenResult = { ok: true } | { ok: false; reason: string };

/**
 * Screen LLM-authored narrative fields before they enter the shared permanent
 * cache. Pass every string the LLM wrote (narrative fields; on the deep-cut
 * path also targetTitle/targetByline/linkClaim — they're model output too).
 * Deterministic and local: same input, same verdict, nothing leaves the
 * process. `{ ok: false }` means REJECT: refund the meter, persist nothing.
 */
export function screenNarrative(fields: string[]): ScreenResult {
  let total = 0;
  for (const field of fields) {
    if (field.length > MAX_FIELD_CHARS) {
      return {
        ok: false,
        reason: `field exceeds ${MAX_FIELD_CHARS} chars (${field.length})`,
      };
    }
    total += field.length;

    for (const { pattern, reason } of ARTIFACT_CHECKS) {
      if (pattern.test(field)) return { ok: false, reason };
    }

    const normalized = normalize(field);
    for (let i = 0; i < BLOCKLIST_PATTERNS.length; i += 1) {
      if (BLOCKLIST_PATTERNS[i].test(normalized)) {
        return { ok: false, reason: `blocklist term: ${BLOCKLIST[i]}` };
      }
    }
  }
  if (total > MAX_TOTAL_CHARS) {
    return {
      ok: false,
      reason: `narrative exceeds ${MAX_TOTAL_CHARS} total chars (${total})`,
    };
  }
  return { ok: true };
}

import "server-only";

/**
 * Torre de Control — cost model. Two halves:
 *
 *  1. VARIABLE (LLM): price-per-token tables so llm_call_log rows convert to
 *     real dollars. Prices are LIST prices per million tokens — Gemini's free
 *     tier bills $0 in practice, but pricing at list keeps the burn number
 *     honest about what the habit would cost the day the free tier ends.
 *  2. FIXED: manually-maintained monthly line items (there is no clean API
 *     attribution — Vercel/Neon are shared with communeo on Hobby/free tiers,
 *     so pulling their billing APIs would produce garbage). Edit this file
 *     when a subscription changes; the portal reads it at render time.
 */

interface ModelPricing {
  match: (model: string) => boolean;
  /** USD per million input tokens (cache reads/writes folded in upstream). */
  inputPerMTok: number;
  /** USD per million output tokens. */
  outputPerMTok: number;
}

const MODEL_PRICING: ModelPricing[] = [
  // Anthropic premium tier (see crossmedia-provider.ts LLM_MODEL comment).
  { match: (m) => m.startsWith("claude-opus"), inputPerMTok: 5, outputPerMTok: 25 },
  // Gemini list prices; free tier actually bills $0 (see module comment).
  { match: (m) => m.includes("flash-lite"), inputPerMTok: 0.1, outputPerMTok: 0.4 },
  { match: (m) => m.includes("gemini") && m.includes("flash"), inputPerMTok: 0.3, outputPerMTok: 2.5 },
  { match: (m) => m === "fixture", inputPerMTok: 0, outputPerMTok: 0 },
];

/**
 * Estimated USD for one call. Unknown models price at $0 with a console.warn
 * (visible in Vercel logs) rather than inventing a number — the /admin/recos
 * panel still shows their token volume.
 */
export function llmCostUsd(
  model: string,
  inputTokens: number | null,
  outputTokens: number | null,
): number {
  const pricing = MODEL_PRICING.find((p) => p.match(model));
  if (!pricing) {
    console.warn(`[admin] no pricing for model "${model}" — costing $0`);
    return 0;
  }
  return (
    ((inputTokens ?? 0) / 1_000_000) * pricing.inputPerMTok +
    ((outputTokens ?? 0) / 1_000_000) * pricing.outputPerMTok
  );
}

/** Fixed monthly line items (founder-maintained; see module comment). */
export const FIXED_MONTHLY_COSTS: { name: string; usd: number }[] = [
  { name: "TMDB comercial", usd: 149 },
  { name: "Dominio baclog.app (~$20/año)", usd: 1.67 },
  // $0 hoy, listados para que el burn los recuerde cuando dejen de serlo:
  { name: "Resend (free tier)", usd: 0 },
  { name: "Neon (free tier)", usd: 0 },
  { name: "Vercel (Hobby compartido)", usd: 0 },
];

export function fixedMonthlyCostUsd(): number {
  return FIXED_MONTHLY_COSTS.reduce((sum, c) => sum + c.usd, 0);
}

/**
 * Projected-burn thresholds for the Salud check: fixed (~$151) plus a
 * generous LLM allowance. Crossing WARN means the variable side is no longer
 * pocket change; BAD means something is runaway (a loop, a quota bug).
 */
export const BURN_WARN_USD = 175;
export const BURN_BAD_USD = 250;

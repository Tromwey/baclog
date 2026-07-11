import "server-only";
import { db } from "@/db";
import { llmCallLog } from "@/db/schema";
import type { LlmUsage } from "./crossmedia-provider";

/**
 * Torre de Control — LLM call telemetry writer. One row per provider
 * invocation so /admin can read REAL cost (tokens × price), failure rate and
 * latency instead of inferring them. Deliberately user-free (Pilar 4): the
 * per-user meter already lives on cross_media_rec_usage.
 *
 * "ok" means THE MODEL did its job — a later grounding miss is a pipeline
 * outcome (tracked as spent_no_match on the usage meter), not an LLM failure.
 * "transient" = provider 429/network/unusable output; "moderation_rejected" =
 * usable output that our deterministic screen refused to persist.
 */
export type LlmCallOutcome = "ok" | "transient" | "moderation_rejected";

export interface LlmCallEntry {
  kind: "propose" | "narrate";
  provider: string;
  model: string;
  promptVersion: number;
  latencyMs: number;
  usage: LlmUsage | undefined;
  outcome: LlmCallOutcome;
}

/**
 * Best-effort insert: telemetry must never fail (or slow-fail) a reco, so any
 * DB error is logged and swallowed. Await it — a floating promise can be cut
 * off when the serverless invocation ends; the insert is one cheap HTTP query.
 */
export async function logLlmCall(entry: LlmCallEntry): Promise<void> {
  try {
    await db.insert(llmCallLog).values({
      kind: entry.kind,
      provider: entry.provider,
      model: entry.model,
      promptVersion: entry.promptVersion,
      latencyMs: Math.max(0, Math.round(entry.latencyMs)),
      inputTokens: entry.usage?.inputTokens ?? null,
      outputTokens: entry.usage?.outputTokens ?? null,
      outcome: entry.outcome,
    });
  } catch (err) {
    console.error("[crossmedia] llm_call_log insert failed:", err);
  }
}

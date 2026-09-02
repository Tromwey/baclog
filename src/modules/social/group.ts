import type { FeedBurst, FeedCard, FeedEvent } from "./types";

/**
 * Feed v2 — the pure, isomorphic half of the card assembly: events → cards.
 * Mirrors the design's DCLogic (Feed.dc.html: group + arrange) exactly, so
 * the running feed and the mock agree by construction:
 *
 *  - group():  consecutive JOINABLE events (an `added` that is not a
 *              "no puede esperar") by the same author to the SAME backlog
 *              form a run; a run of >= BURST_THRESHOLD becomes one burst
 *              card, a shorter one stays as singles. Any other event breaks
 *              the run. Backlogs are never crossed (cross:false in the mock —
 *              "Agregó 8 títulos a 2026", never "a 2026 y Pendientes").
 *  - lift():   within each time bucket (hoy / esta semana / antes) the GEMS
 *              (obsessed, reviewed) float above the compacts; original
 *              (chronological) order is the tiebreak, and nothing ever moves
 *              across a bucket — "las joyas pueden subir dentro de su bloque
 *              temporal; nada cambia de día".
 *
 * No "server-only": this is plain data shaping and stays testable anywhere.
 */

/** The mock's default; the founder can tune it (2..8) without touching UI. */
export const BURST_THRESHOLD = 2;

const DAY = 86_400_000;

export function isJoinable(e: FeedEvent): boolean {
  return e.kind === "added" && e.waiting === null && e.backlogName !== null;
}

function makeBurst(run: FeedEvent[]): FeedBurst {
  const newest = run[0];
  const counts = new Map<string, number>();
  for (const e of run) counts.set(e.mediaTypeLabel, (counts.get(e.mediaTypeLabel) ?? 0) + 1);
  return {
    kind: "burst",
    id: `burst:${newest.id}`,
    author: newest.author,
    when: newest.when,
    backlogName: newest.backlogName ?? "",
    count: run.length,
    typeCounts: [...counts.entries()].map(([k, n]) => `${k} ×${n}`).join(" · "),
    items: run,
  };
}

/** Events (newest first) → cards, folding bursts. Pure. */
export function groupIntoCards(
  events: FeedEvent[],
  threshold = BURST_THRESHOLD,
): FeedCard[] {
  const out: FeedCard[] = [];
  let run: FeedEvent[] = [];
  const flush = () => {
    if (run.length >= threshold) out.push(makeBurst(run));
    else for (const e of run) out.push({ kind: "single", event: e });
    run = [];
  };
  for (const e of events) {
    if (
      isJoinable(e) &&
      run.length > 0 &&
      run[0].author.username === e.author.username &&
      run[0].backlogName === e.backlogName
    ) {
      run.push(e);
      continue;
    }
    flush();
    if (isJoinable(e)) run.push(e);
    else out.push({ kind: "single", event: e });
  }
  flush();
  return out;
}

export function isGem(card: FeedCard): boolean {
  return (
    card.kind === "single" &&
    (card.event.kind === "obsessed" || card.event.kind === "reviewed")
  );
}

/** 0 = hoy · 1 = esta semana · 2 = antes. A burst sits in its newest add's bucket. */
export function bucketOf(card: FeedCard, now: number): 0 | 1 | 2 {
  const at = new Date(
    card.kind === "burst" ? card.items[0].at : card.event.at,
  ).getTime();
  const age = now - at;
  return age < DAY ? 0 : age < 7 * DAY ? 1 : 2;
}

/** Gems float to the top of their own time bucket; everything else keeps order. */
export function liftGems(cards: FeedCard[], now: number): FeedCard[] {
  return cards
    .map((card, i) => ({ card, i, bucket: bucketOf(card, now), gem: isGem(card) ? 0 : 1 }))
    .sort((a, b) => a.bucket - b.bucket || a.gem - b.gem || a.i - b.i)
    .map((x) => x.card);
}

/** The last event a page of cards consumed — where the next keyset page starts. */
export function lastEventOf(cards: FeedCard[]): FeedEvent | null {
  const last = cards.at(-1);
  if (!last) return null;
  return last.kind === "burst" ? last.items.at(-1)! : last.event;
}

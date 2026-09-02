import { DAY, HOUR, WEEK } from "@/modules/reviews/format";
import type { FeedBurst, FeedCard, FeedEvent } from "./types";

/**
 * Feed v2 — the pure, isomorphic half of the card assembly: events → cards.
 * Mirrors the design's DCLogic (Feed.dc.html: group + arrange), so the
 * running feed and the mock agree by construction:
 *
 *  - group():  consecutive JOINABLE events (an `added` that is not a
 *              "no puede esperar") by the same author to the SAME backlog
 *              (by id — names aren't unique per user) form a run; a run of
 *              >= BURST_THRESHOLD becomes one burst card, a shorter one stays
 *              as singles. Any other event breaks the run, and so does a gap
 *              of more than BURST_GAP between two adds: a burst is one
 *              SITTING, because the card carries a single time ("hace 2 h")
 *              and files itself in one bucket — a June add must never ride
 *              under today's timestamp. Backlogs are never crossed
 *              (cross:false in the mock — "Agregó 8 títulos a 2026", never
 *              "a 2026 y Pendientes").
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
/** Two adds further apart than this are two sittings, never one burst. */
export const BURST_GAP = 6 * HOUR;

export function isJoinable(e: FeedEvent): boolean {
  return e.kind === "added" && e.waiting === null && e.backlogId !== null;
}

/** Same author, same backlog (by id), and close enough in time to the run's
 *  oldest add so far — `events` arrive newest first, so `prev` is older-bound. */
function joins(prev: FeedEvent, e: FeedEvent): boolean {
  return (
    prev.author.username === e.author.username &&
    prev.backlogId === e.backlogId &&
    new Date(prev.at).getTime() - new Date(e.at).getTime() <= BURST_GAP
  );
}

function makeBurst(run: FeedEvent[]): FeedBurst {
  const newest = run[0];
  return {
    kind: "burst",
    id: `burst:${newest.id}`,
    author: newest.author,
    when: newest.when,
    backlogId: newest.backlogId ?? "",
    backlogName: newest.backlogName ?? "",
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
    if (isJoinable(e) && run.length > 0 && joins(run[run.length - 1], e)) {
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

/**
 * The cards that can no longer change when older events arrive: everything
 * except the TRAILING run of joinable adds (one burst, or up to threshold-1
 * singles by the same author to the same backlog), which the next chunk might
 * still extend. Any other card was closed by a breaking event after it. This
 * is how a page is cut without ever splitting a burst.
 */
export function closedPrefix(cards: FeedCard[]): FeedCard[] {
  let end = cards.length;
  const last = cards[end - 1];
  if (!last) return cards;
  if (last.kind === "burst") return cards.slice(0, end - 1);
  if (!isJoinable(last.event)) return cards;
  while (end > 0) {
    const c = cards[end - 1];
    if (c.kind !== "single" || !isJoinable(c.event)) break;
    if (
      c.event.author.username !== last.event.author.username ||
      c.event.backlogId !== last.event.backlogId
    )
      break;
    end--;
  }
  return cards.slice(0, end);
}

export function isGem(card: FeedCard): boolean {
  return (
    card.kind === "single" &&
    (card.event.kind === "obsessed" || card.event.kind === "reviewed")
  );
}

/** 0 = hoy · 1 = esta semana · 2 = antes — the same boundaries relativeWhen
 *  uses for "hace N h" / "hace N d" / "hace N sem". A burst sits in its newest
 *  add's bucket. */
export function bucketOf(card: FeedCard, now: number): 0 | 1 | 2 {
  const at = new Date(
    card.kind === "burst" ? card.items[0].at : card.event.at,
  ).getTime();
  const age = now - at;
  return age < DAY ? 0 : age < WEEK ? 1 : 2;
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

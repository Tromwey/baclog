import { redactedError } from "@/authz/safe-log";
import { NextResponse } from "next/server";
import { SITE_URL } from "@/lib/site";
import {
  and,
  asc,
  eq,
  exists,
  gte,
  isNull,
  lt,
  lte,
  notExists,
  notInArray,
  sql,
  type SQL,
} from "drizzle-orm";
import { db } from "@/db";
import { cronBudget, deliverOnce, isAuthorizedCron, STALE_CLAIM } from "@/lib/cron";
import {
  catalogItems,
  releaseNotices,
  userItems,
  users,
} from "@/db/schema";
import { storefrontOr } from "@/modules/catalog/apple-music-map";
import { getAlbumDetail } from "@/modules/catalog/itunes";
import { homeDayLong } from "@/modules/catalog/release";
import { releaseFirstLine, releaseSubject, sendReleaseEmail } from "@/auth/mailer";
import { pushToUsers, type PushOutcome, type PushTarget } from "@/modules/push/apns";
import { sweepExpiredVerificationTokens } from "@/auth/otp";
import { pruneStaleDeviceTokens } from "@/modules/push/devices";
import { libraryMedia, libraryMediaType } from "@/modules/catalog/library-media";

export const maxDuration = 60;

/** How far back to look for crossings. Comfortably wider than the 24h cadence
 *  so a skipped or failed run still catches yesterday's releases. */
const WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

/** Titles notified per run. Bounded because maxDuration is 60s and each title
 *  costs an iTunes round-trip (albums) plus an email per owner, all
 *  sequential. The 3-day window makes the run re-entrant: whatever doesn't fit
 *  today is still in range tomorrow — and `truncated` in the response says so. */
const NOTIFY_LIMIT = 20;

/** Owned albums refreshed per run OUTSIDE the notify pass (see pass 2). */
const REFRESH_LIMIT = 5;

/** Pass 0 (retroactive resolve) is housekeeping that runs BEFORE the notify
 *  pass: up to 25 sequential iTunes lookups. With iTunes slow it must not eat
 *  the run — past this mark it stops and the rest waits for tomorrow. */
const RESOLVE_BUDGET_MS = 12_000;

/**
 * THE audience of a release email, as one predicate shared by the "which
 * titles" query and the "which owners" query so the two can never disagree
 * (if they did, a title would be picked every day and mail nobody, eating the
 * per-run limit). A user_item row is a pending recipient when:
 *
 * - its user has `notifyReleases` on (the opt-out; filtered here rather than
 *   at send time so an opted-out user never claims a release_notice row —
 *   turning the switch back on must not find the notice already "sent");
 * - it was SAVED BEFORE THE RELEASE (`user_item.added_at` = the first save,
 *   the min across memberships — verified against backlog_item in the DB).
 *   "Hoy sale X" is only true for someone who was waiting: M4 and the privacy
 *   notice promise it, and without the gate a film saved from Descubrir two
 *   days after it came out gets "hoy sale" (it happened: 7 of the first 10
 *   album notices went to people who saved the album AFTER its release);
 * - its notice is neither SENT nor freshly claimed (`release_notice` is the
 *   ever-once record): a row with `email_sent_at` set is final; one without
 *   it only blocks while it is younger than `STALE_CLAIM` (a live run), and
 *   after that it is an abandoned claim that must be retried — before, such
 *   a row blocked its user forever. The claim below stays the idempotency
 *   guarantee against overlapping runs; this filter is what keeps
 *   already-told titles OUT of the limited batch.
 */
function pendingRecipient(
  catalogItemId: typeof catalogItems.id | string,
  releaseDate: typeof catalogItems.releaseDate | Date,
): SQL {
  return and(
    eq(userItems.catalogItemId, catalogItemId),
    eq(users.notifyReleases, true),
    lt(userItems.addedAt, releaseDate),
    notExists(
      db
        .select({ one: sql`1` })
        .from(releaseNotices)
        .where(
          and(
            eq(releaseNotices.userId, userItems.userId),
            eq(releaseNotices.catalogItemId, catalogItemId),
            sql`(${releaseNotices.emailSentAt} is not null or ${releaseNotices.createdAt} > ${STALE_CLAIM})`,
          ),
        ),
    ),
  )!;
}

/**
 * Re-read an album from iTunes on release day and write back what a pre-order
 * row gets wrong: no year, a date that moved, pre-order art. "fresh" and not
 * the default: this call is the entire point, and the 24h data cache could
 * otherwise serve a copy fetched BEFORE the 07:00Z release.
 *
 * `getAlbumDetail` never throws — iTunes being down comes back as
 * `unavailable`. Then only the year (derivable from our own date) is written
 * and `refreshedAt` is NOT stamped, so pass 2 retries the album tomorrow.
 * Returns the release date to trust from here on.
 */
async function refreshAlbum(
  item: {
    id: string;
    externalId: string;
    storefront: string | null;
    year: number | null;
    posterUrl: string | null;
    releaseDate: Date;
  },
  now: Date,
): Promise<{ releaseDate: Date; unavailable: boolean }> {
  const detail = await getAlbumDetail(item.externalId, "fresh", storefrontOr(item.storefront));
  // UTC year: every stored release instant falls inside its UTC day (see
  // STOREFRONT_TZ in catalog/release.ts).
  const resolvedYear = item.year ?? item.releaseDate.getUTCFullYear();
  if (detail.unavailable) {
    if (resolvedYear !== item.year) {
      await db
        .update(catalogItems)
        .set({ year: resolvedYear })
        .where(eq(catalogItems.id, item.id));
    }
    return { releaseDate: item.releaseDate, unavailable: true };
  }
  // A date that moved AGAIN (a delay announced on release day) wins: better a
  // countdown that slips than an email that lies.
  const releaseDate = detail.releaseDate ?? item.releaseDate;
  await db
    .update(catalogItems)
    .set({
      year: resolvedYear,
      releaseDate,
      // Labels swap a pre-order's art, so this is the moment to take it again
      // — coalesced: a lookup without artwork must never blank a cover.
      posterUrl: detail.posterUrl ?? item.posterUrl,
      refreshedAt: now,
    })
    .where(eq(catalogItems.id, item.id));
  return { releaseDate, unavailable: false };
}

/**
 * F3.8 — the release-day cron (daily, 14:00 UTC = 08:00 CDMX). Albums AND
 * video since 2026-09-24 (founder decision: the TMDB day is persisted, see
 * `RELEASE_DAY_UTC_HOUR` in catalog/release.ts). Passes, in this order:
 *
 * H. HOUSEKEEPING. Sweep expired OTP codes (`verification_token`) — the daily
 *    backstop to the opportunistic sweep in issueOtp, so an abandoned code
 *    doesn't sit in the table forever. Its failure never blocks the release
 *    job, but it does fail the run (500).
 * 0. RESOLVE. Fill in dates for pre-orders that predate the feature (see the
 *    pass itself) — otherwise the users who were ALREADY waiting for something
 *    are the only ones the feature never reaches.
 * 1. NOTIFY. Titles in the window with at least one PENDING recipient
 *    (`pendingRecipient`) — nothing else, so ownerless chart albums and titles
 *    already told to everyone can't crowd the limit and leave someone
 *    unmailed. An album is REFRESHED first (`refreshAlbum`): its catalog row
 *    is a pre-order snapshot, and the email must not announce an album whose
 *    date slipped. Video has no refresh — its day comes from TMDB via the
 *    search/discover upsert (a moved date is corrected by the next search of
 *    it; see state/backend.md for the known gap).
 * 2. REFRESH the rest. Owned albums in the window not refreshed since they
 *    landed that pass 1 didn't pick (every owner opted out, saved after the
 *    release, or was already told). Small cap, and OWNED only: an ownerless
 *    chart album has nobody looking at it, and the first save doesn't need
 *    this pass (a chart row already carries its year; the item view re-reads
 *    the date — `getItemDisplayMedia` → `cacheReleaseDate`).
 *
 * 3. PUSH (phase 4e). Every recipient whose email went out also gets a push
 *    on their registered devices (title = the email subject, body = its
 *    first line, payload `{ kura: { type: "release", titleId } }`). Sent PER
 *    TITLE, right after that title's emails (`pushToUsers`: one batch per
 *    title) — not in one batch at the end of the run, where a run killed at
 *    maxDuration lost every push of the day although the emails (and their
 *    claims, which stop any retry) had gone out. Same audience as the email by
 *    construction (only after `sent++`), so it inherits the `notifyReleases`
 *    opt-out and the release_notice claim — a retried email never double-
 *    pushes. A push failure never fails the run (the email is the delivery
 *    of record); it is counted in `pushFailed` and logged. Without migration
 *    0029 or any provider keys it is a logged no-op (`pushSkipped`);
 *    deliveries whose provider alone lacks keys are `pushUndelivered`.
 *
 * Time. Every upstream call has a deadline (`fetchWithTimeout`) and the run
 * has a wall-clock budget (`cronBudget`): before each title, each recipient
 * and each refresh it checks the clock and stops EARLY rather than being
 * killed mid-send with no response. Whatever wasn't reached holds no claim,
 * is still inside the 3-day window, and goes out in the next run
 * (`timedOut` + `truncated` in the response).
 *
 * Idempotency is the recap cron's (`deliverOnce` in lib/cron.ts): the INSERT
 * … ON CONFLICT … RETURNING on release_notice is an atomic claim, so an
 * at-least-once trigger (retry, manual run, overlap) can't double-send; the
 * conflict arm only takes over an ABANDONED claim (`STALE_CLAIM`), in the
 * same statement, so two runs can't both adopt it. One user's failure never
 * aborts the batch, but ANY notify failure makes the run answer 500, so
 * Vercel marks the cron as failed instead of a green run that told nobody.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const budget = cronBudget(maxDuration);
  // Set when a pass stopped on the clock with work left.
  let timedOut = false;

  const now = new Date();
  const since = new Date(now.getTime() - WINDOW_MS);

  // ---- H. HOUSEKEEPING: expired OTP codes. null = the sweep failed.
  let otpSwept: number | null = null;
  try {
    otpSwept = await sweepExpiredVerificationTokens();
  } catch (err) {
    console.error("[cron/release] expired OTP sweep failed:", redactedError(err));
  }
  // ---- H. HOUSEKEEPING: APNs tokens of signed-out installs (session
  // revoked, or unseen for the bearer lifetime). `pushToUsers` already skips
  // them; this keeps `device_token` from filling with dead phones. null = the
  // prune failed (the run answers 500, like the OTP sweep).
  let devicesPruned: number | null = null;
  try {
    devicesPruned = await pruneStaleDeviceTokens(now);
  } catch (err) {
    console.error("[cron/release] stale device-token prune failed:", redactedError(err));
  }

  // ---- 0. RETROACTIVE RESOLVE. Albums that entered the catalog BEFORE F3.8
  // existed never got a date: search doesn't carry one for a pre-order, and
  // the add-time lookup didn't exist yet. Without this pass they stay invisible
  // to the whole feature — no countdown, no shelf, no email — for exactly the
  // users who were already waiting for something. `year IS NULL` is the
  // pre-order signature (a released album always carries a year from search),
  // and the join to user_item keeps this to titles somebody actually owns.
  // Bounded per run: this is a backlog to work through, not a scan to finish.
  // The refreshedAt guard is what stops it becoming permanent: a dateless album
  // usually has no date to find (most are just missing metadata, not
  // pre-orders), and without the filter those same rows would burn the 25-call
  // budget every single day, forever. Stamping on every ANSWERED attempt —
  // found or not, but never on a lookup iTunes didn't answer — is the same
  // trick catalog_item.link_edges_checked_at uses for seeds with zero edges. A week is well inside the horizon that matters: the item view
  // and the add path both resolve dates on their own, so this is the backstop.
  const retryBefore = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const dateless = await db
    .selectDistinct({
      id: catalogItems.id,
      externalId: catalogItems.externalId,
      // The Apple Music store the album was found in (apple-catalog.ts).
      storefront: sql<string | null>`${catalogItems.raw}->>'_storefront'`,
    })
    .from(catalogItems)
    .innerJoin(userItems, eq(userItems.catalogItemId, catalogItems.id))
    .where(
      and(
        eq(catalogItems.mediaType, "album"),
        eq(catalogItems.source, "itunes"),
        isNull(catalogItems.year),
        isNull(catalogItems.releaseDate),
        lt(catalogItems.refreshedAt, retryBefore),
      ),
    )
    .limit(25);

  let resolved = 0;
  let resolveFailed = 0;
  // iTunes gave no answer for these: not stamped, retried tomorrow.
  let resolveUnavailable = 0;
  for (const album of dateless) {
    // Not `timedOut`: this backlog is re-queried every day by design.
    if (budget.elapsedMs() > RESOLVE_BUDGET_MS) break;
    try {
      const detail = await getAlbumDetail(album.externalId, "pending", storefrontOr(album.storefront));
      // Neither Apple Music nor iTunes answered (timeout, 5xx): that is NOT
      // "this album has no date". Stamping `refreshedAt` here would park the
      // album for a week on an answer nobody gave — leave it for tomorrow.
      if (detail.unavailable) {
        resolveUnavailable++;
        continue;
      }
      await db
        .update(catalogItems)
        .set({
          ...(detail.releaseDate ? { releaseDate: detail.releaseDate } : {}),
          refreshedAt: now,
        })
        .where(eq(catalogItems.id, album.id));
      if (detail.releaseDate) resolved++;
    } catch (err) {
      // A DB write failed (getAlbumDetail never throws). Housekeeping like
      // pass 2: counted and logged, doesn't fail the run.
      console.error(`[cron/release] resolve ${album.id} failed:`, redactedError(err));
      resolveFailed++;
    }
  }

  // ---- 1. NOTIFY. Titles (any format) whose clock hit zero inside the window
  // AND that still owe somebody an email. The exists() is `pendingRecipient`
  // correlated on the outer catalog row — the same predicate the per-title
  // owner query uses below.
  const landed = await db
    .select({
      id: catalogItems.id,
      source: catalogItems.source,
      // Library formats only (a party song never has a user_item, so never
      // an owner to mail); the filter below makes it explicit.
      mediaType: libraryMediaType(),
      externalId: catalogItems.externalId,
      // The Apple Music store the album was found in (apple-catalog.ts).
      storefront: sql<string | null>`${catalogItems.raw}->>'_storefront'`,
      title: catalogItems.title,
      byline: catalogItems.byline,
      year: catalogItems.year,
      posterUrl: catalogItems.posterUrl,
      releaseDate: catalogItems.releaseDate,
      refreshedAt: catalogItems.refreshedAt,
    })
    .from(catalogItems)
    .where(
      and(
        gte(catalogItems.releaseDate, since),
        lte(catalogItems.releaseDate, now),
        libraryMedia(),
        exists(
          db
            .select({ one: sql`1` })
            .from(userItems)
            .innerJoin(users, eq(users.id, userItems.userId))
            .where(pendingRecipient(catalogItems.id, catalogItems.releaseDate)),
        ),
      ),
    )
    .orderBy(asc(catalogItems.releaseDate))
    .limit(NOTIFY_LIMIT);

  let refreshed = 0;
  let refreshUnavailable = 0;
  let sent = 0;
  // Kept apart on purpose: "the date moved" and "already notified" are the
  // two things you want to tell apart when reading a run. alreadySent can now
  // only come from an overlapping run (the query excludes claimed notices).
  let slipped = 0;
  let alreadySent = 0;
  let failed = 0;
  // The email went out but `email_sent_at` didn't get stamped: the user WAS
  // told (not a `failed`), the audit row is just incomplete.
  let stampFailed = 0;
  // Pass 3's totals, summed over the per-title batches.
  const push: PushOutcome = { sent: 0, failed: 0, pruned: 0, skipped: null, undelivered: 0 };

  for (const item of landed) {
    // Non-null by the window filter; narrowed for the type checker.
    if (!item.releaseDate) continue;
    if (budget.exhausted()) {
      timedOut = true;
      break;
    }
    let releaseDate = item.releaseDate;
    // This title's pushes: one entry per recipient whose email went out.
    const pushQueue: PushTarget[] = [];
    try {
      // Album refresh — skipped when the row was already refreshed after it
      // landed (a retry of yesterday's partial run doesn't re-ask iTunes).
      if (
        item.source === "itunes" &&
        item.mediaType === "album" &&
        item.refreshedAt.getTime() < releaseDate.getTime()
      ) {
        const r = await refreshAlbum({ ...item, releaseDate }, now);
        releaseDate = r.releaseDate;
        if (r.unavailable) refreshUnavailable++;
        else refreshed++;
        // Slipped past now → not out after all, so nobody gets told it is.
        if (releaseDate.getTime() > now.getTime()) {
          slipped++;
          continue;
        }
      }

      // One row per pending recipient (user_item), so a title filed in two
      // collections still sends exactly one email. Gated on the release date
      // we just confirmed, not the one the batch query read.
      const owners = await db
        .select({
          userId: userItems.userId,
          email: users.email,
          addedAt: userItems.addedAt,
        })
        .from(userItems)
        .innerJoin(users, eq(users.id, userItems.userId))
        .where(pendingRecipient(item.id, releaseDate));

      for (const owner of owners) {
        // Unreached owners hold no claim: tomorrow's run mails them.
        if (budget.exhausted()) {
          timedOut = true;
          break;
        }
        try {
          let claimId: string | null = null;
          const outcome = await deliverOnce({
            label: `[cron/release] user ${owner.userId} / item ${item.id}`,
            claim: async () => {
              const [claimed] = await db
                .insert(releaseNotices)
                .values({ userId: owner.userId, catalogItemId: item.id })
                // Conflict = a row exists. Take it over ONLY if it is an
                // abandoned claim (never sent, older than STALE_CLAIM);
                // re-stamping created_at makes it a live claim again, so a
                // racing run's identical statement matches nothing.
                .onConflictDoUpdate({
                  target: [releaseNotices.userId, releaseNotices.catalogItemId],
                  set: { createdAt: sql`now()` },
                  setWhere: sql`${releaseNotices.emailSentAt} is null and ${releaseNotices.createdAt} <= ${STALE_CLAIM}`,
                })
                .returning({ id: releaseNotices.id });
              claimId = claimed?.id ?? null;
              return claimed;
            },
            send: async () => {
              // How long they waited — the one thing this email knows that a
              // store notification doesn't. From user_item.addedAt: the first
              // save (min across memberships), the same instant the audience
              // gate compares, so the copy and the gate can't disagree.
              const waitedDays = Math.round(
                (releaseDate.getTime() - owner.addedAt.getTime()) / 86_400_000,
              );
              await sendReleaseEmail(owner.email, {
                format: item.mediaType,
                title: item.title,
                byline: item.byline,
                itemUrl: `${SITE_URL}/item/${item.id}`,
                // An add is an instant, not a release day: printed in the
                // product's home zone (an add at 20:00 CDMX is tomorrow in UTC).
                addedOn: homeDayLong(owner.addedAt),
                waitedDays,
              });
              return "sent";
            },
            // RELEASE THE CLAIM on a failed send (Resend down, a 429): the
            // claim is taken before the send so two overlapping runs can't
            // both mail, and without the release that row would block the
            // retry. If the release fails too, `deliverOnce` logs the claim
            // and STALE_CLAIM picks it up on a later run.
            release: (claimed) =>
              db.delete(releaseNotices).where(eq(releaseNotices.id, claimed.id)),
          });
          if (outcome === "already") {
            alreadySent++;
            continue;
          }
          sent++;
          pushQueue.push({
            userId: owner.userId,
            message: {
              title: releaseSubject(item.title),
              body: releaseFirstLine({
                format: item.mediaType,
                title: item.title,
                byline: item.byline,
              }),
              data: { type: "release", titleId: item.id },
            },
          });
          try {
            await db
              .update(releaseNotices)
              .set({ emailSentAt: new Date() })
              .where(eq(releaseNotices.id, claimId!));
          } catch (err) {
            console.error(
              `[cron/release] claim ${claimId}: email sent but email_sent_at not stamped (it will be re-sent once the claim goes stale):`, redactedError(err));
            stampFailed++;
          }
        } catch (err) {
          console.error(
            `[cron/release] user ${owner.userId} / item ${item.id} failed:`, redactedError(err));
          failed++;
        }
      }
    } catch (err) {
      console.error(`[cron/release] item ${item.id} failed:`, redactedError(err));
      failed++;
    }

    // ---- 3. PUSH this title's recipients, now. Never throws. Outside the
    // try on purpose: an owner query that failed halfway must not drop the
    // pushes of the emails that already went out.
    if (pushQueue.length > 0) {
      const r = await pushToUsers(pushQueue);
      push.sent += r.sent;
      push.failed += r.failed;
      push.pruned += r.pruned;
      push.undelivered += r.undelivered;
      push.skipped = r.skipped ?? push.skipped;
    }
    if (timedOut) break;
  }

  // ---- 2. REFRESH the owned albums pass 1 didn't pick (see the header).
  // `refreshed_at < release_date` = not re-read since it landed; a successful
  // refresh (here or in pass 1) stamps it and drops the row out of this query
  // for good, and a slipped date leaves the window. Titles pass 1 just
  // handled are excluded by id: an `unavailable` refresh there didn't stamp,
  // and one iTunes miss per album per run is enough.
  const handledIds = landed.map((l) => l.id);
  const stale = await db
    .select({
      id: catalogItems.id,
      externalId: catalogItems.externalId,
      // The Apple Music store the album was found in (apple-catalog.ts).
      storefront: sql<string | null>`${catalogItems.raw}->>'_storefront'`,
      year: catalogItems.year,
      posterUrl: catalogItems.posterUrl,
      releaseDate: catalogItems.releaseDate,
    })
    .from(catalogItems)
    .where(
      and(
        eq(catalogItems.source, "itunes"),
        eq(catalogItems.mediaType, "album"),
        gte(catalogItems.releaseDate, since),
        lte(catalogItems.releaseDate, now),
        lt(catalogItems.refreshedAt, catalogItems.releaseDate),
        exists(
          db
            .select({ one: sql`1` })
            .from(userItems)
            .where(eq(userItems.catalogItemId, catalogItems.id)),
        ),
        handledIds.length > 0
          ? notInArray(catalogItems.id, handledIds)
          : undefined,
      ),
    )
    .orderBy(asc(catalogItems.releaseDate))
    .limit(REFRESH_LIMIT);

  let refreshFailed = 0;
  for (const album of stale) {
    if (!album.releaseDate) continue;
    // Housekeeping: the row keeps `refreshed_at < release_date`, so the next
    // run's query finds it again.
    if (budget.exhausted()) {
      timedOut = true;
      break;
    }
    try {
      const r = await refreshAlbum({ ...album, releaseDate: album.releaseDate }, now);
      if (r.unavailable) refreshUnavailable++;
      else refreshed++;
    } catch (err) {
      // A DB write failed (iTunes itself never throws): housekeeping, so it
      // doesn't fail the run, but it is counted and logged, not swallowed.
      console.error(`[cron/release] refresh ${album.id} failed:`, redactedError(err));
      refreshFailed++;
    }
  }

  if (timedOut) {
    console.error(
      `[cron/release] stopped on the clock at ${budget.elapsedMs()} ms with work left — unreached recipients hold no claim and go out in the next run`,
    );
  }

  // 500 when somebody who should have been told wasn't (failed), when a sent
  // email left its audit row unstamped, or when the OTP sweep or the
  // device-token prune broke: Vercel
  // shows the run as failed. iTunes being down (refreshUnavailable) is NOT a
  // failure — the upstream is flaky by nature and the next run retries.
  const ok = failed === 0 && stampFailed === 0 && otpSwept !== null && devicesPruned !== null;
  return NextResponse.json(
    {
      otpSwept,
      devicesPruned,
      resolved,
      resolveFailed,
      resolveUnavailable,
      landed: landed.length,
      // The batch hit its cap: more titles with pending recipients are
      // waiting. They stay in the window and go out in the next runs.
      truncated: landed.length === NOTIFY_LIMIT || timedOut,
      // The run stopped on its wall-clock budget (not on the title cap).
      timedOut,
      refreshed,
      refreshUnavailable,
      refreshFailed,
      sent,
      slipped,
      alreadySent,
      failed,
      stampFailed,
      pushed: push.sent,
      pushFailed: push.failed,
      pushPruned: push.pruned,
      pushSkipped: push.skipped,
      pushUndelivered: push.undelivered,
    },
    { status: ok ? 200 : 500 },
  );
}

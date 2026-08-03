import { NextResponse } from "next/server";
import { and, asc, eq, gte, isNotNull, isNull, lt, lte } from "drizzle-orm";
import { env } from "@/lib/env";
import { db } from "@/db";
import {
  backlogItems,
  catalogItems,
  releaseNotices,
  userItems,
  users,
} from "@/db/schema";
import { getAlbumDetail } from "@/modules/catalog/itunes";
import { releaseDayLong } from "@/modules/catalog/release";
import { sendReleaseEmail } from "@/auth/mailer";

export const maxDuration = 60;

/** How far back to look for crossings. Comfortably wider than the 24h cadence
 *  so a skipped or failed run still catches yesterday's releases. */
const WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * F3.8 — the release-day cron (daily). Two jobs, in this order, because the
 * second is worthless without the first:
 *
 * 0. RESOLVE. Fill in dates for pre-orders that predate the feature (see the
 *    pass itself) — otherwise the users who were ALREADY waiting for something
 *    are the only ones the feature never reaches.
 * 1. REFRESH. A pre-order's catalog row is a snapshot that is WRONG in specific
 *    ways: no year, and placeholder tracks that only fill in on release.
 *    Nothing in the app fixes it on its own — catalog refresh only happens via
 *    a search upsert on a 90-day horizon, so an album added at pre-order would
 *    stay pre-order-shaped forever unless someone searched it again. Without
 *    this pass, the email below announces an album whose tracklist still reads
 *    "Track 4".
 * 2. NOTIFY. Everyone with the title in their library, once, ever.
 *
 * Idempotency is the recap cron's: the INSERT … ON CONFLICT DO NOTHING
 * RETURNING on release_notice is an atomic claim, so an at-least-once trigger
 * (retry, manual run, overlap) can't double-send. One user's failure never
 * aborts the batch.
 */
export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const since = new Date(now.getTime() - WINDOW_MS);

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
  // budget every single day, forever. Stamping on EVERY attempt — found or not
  // — is the same trick catalog_item.link_edges_checked_at uses for seeds with
  // zero edges. A week is well inside the horizon that matters: the item view
  // and the add path both resolve dates on their own, so this is the backstop.
  const retryBefore = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const dateless = await db
    .selectDistinct({
      id: catalogItems.id,
      externalId: catalogItems.externalId,
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
  for (const album of dateless) {
    try {
      const detail = await getAlbumDetail(album.externalId);
      await db
        .update(catalogItems)
        .set({
          ...(detail.releaseDate ? { releaseDate: detail.releaseDate } : {}),
          refreshedAt: now,
        })
        .where(eq(catalogItems.id, album.id));
      if (detail.releaseDate) resolved++;
    } catch (err) {
      console.error(`[cron/release] resolve ${album.id} failed:`, err);
    }
  }

  // Albums whose clock hit zero inside the window.
  const landed = await db
    .select({
      id: catalogItems.id,
      externalId: catalogItems.externalId,
      title: catalogItems.title,
      byline: catalogItems.byline,
      year: catalogItems.year,
      posterUrl: catalogItems.posterUrl,
      releaseDate: catalogItems.releaseDate,
    })
    .from(catalogItems)
    .where(
      and(
        eq(catalogItems.mediaType, "album"),
        eq(catalogItems.source, "itunes"),
        isNotNull(catalogItems.releaseDate),
        gte(catalogItems.releaseDate, since),
        lte(catalogItems.releaseDate, now),
      ),
    )
    // Bounded because maxDuration is 60s and each album costs an iTunes
    // round-trip plus an email per owner, all sequential. The 3-day window
    // makes the run re-entrant: whatever doesn't fit today is still in range
    // tomorrow, which is far better than being killed mid-batch.
    .orderBy(asc(catalogItems.releaseDate))
    .limit(20);

  let refreshed = 0;
  let sent = 0;
  // Kept apart on purpose: "the date moved" and "already notified" are the
  // two things you want to tell apart when reading a run.
  let slipped = 0;
  let alreadySent = 0;
  let failed = 0;

  for (const album of landed) {
    try {
      // ---- 1. refresh: the album exists now, so ask what it actually is.
      // "fresh" and not the default: this call is the entire point of the pass,
      // and the 24h data cache could otherwise serve it a copy fetched BEFORE
      // the 07:00Z release — the exact placeholder tracklist it runs to replace.
      const detail = await getAlbumDetail(album.externalId, "fresh");
      const resolvedYear =
        album.year ?? album.releaseDate?.getFullYear() ?? null;
      if (resolvedYear !== album.year || detail.releaseDate || detail.posterUrl) {
        await db
          .update(catalogItems)
          .set({
            year: resolvedYear,
            // A date that moved AGAIN (a delay announced on release day) wins:
            // better a countdown that slips than an email that lies.
            releaseDate: detail.releaseDate ?? album.releaseDate,
            // Labels swap a pre-order's art, so this is the moment to take it
            // again — coalesced, since a lookup that came back without artwork
            // must never blank a cover we already have.
            posterUrl: detail.posterUrl ?? album.posterUrl,
            refreshedAt: now,
          })
          .where(eq(catalogItems.id, album.id));
        refreshed++;
      }
      // Slipped past today → not out after all, so nobody gets told it is.
      if (detail.releaseDate && detail.releaseDate.getTime() > now.getTime()) {
        slipped++;
        continue;
      }

      // ---- 2. notify: one row per user who has the title (user_item), so a
      // title filed in two backlogs still sends exactly one email.
      // notifyReleases is the opt-out (default true, /settings). Filtered HERE
      // rather than skipped at send time on purpose: an opted-out user must not
      // claim a release_notice row, or turning the switch back on would find
      // the notice already "sent" and stay silent forever.
      const owners = await db
        .select({
          userId: userItems.userId,
          email: users.email,
          addedAt: userItems.addedAt,
        })
        .from(userItems)
        .innerJoin(users, eq(users.id, userItems.userId))
        .where(
          and(
            eq(userItems.catalogItemId, album.id),
            eq(users.notifyReleases, true),
          ),
        );

      for (const owner of owners) {
        try {
          const [claimed] = await db
            .insert(releaseNotices)
            .values({ userId: owner.userId, catalogItemId: album.id })
            .onConflictDoNothing({
              target: [releaseNotices.userId, releaseNotices.catalogItemId],
            })
            .returning({ id: releaseNotices.id });
          if (!claimed) {
            alreadySent++;
            continue;
          }

          // How long they waited — the one thing this email knows that a store
          // notification doesn't. Measured from the earliest membership, since
          // user_item.addedAt can be later than the first backlog it entered.
          const [firstAdd] = await db
            .select({ addedAt: backlogItems.addedAt })
            .from(backlogItems)
            .where(
              and(
                eq(backlogItems.userId, owner.userId),
                eq(backlogItems.catalogItemId, album.id),
              ),
            )
            .orderBy(asc(backlogItems.addedAt))
            .limit(1);
          const addedAt = firstAdd?.addedAt ?? owner.addedAt;
          const waitedDays =
            album.releaseDate && addedAt
              ? Math.round(
                  (album.releaseDate.getTime() - addedAt.getTime()) / 86_400_000,
                )
              : null;

          try {
            await sendReleaseEmail(owner.email, {
              title: album.title,
              byline: album.byline,
              itemUrl: `https://baclog.app/item/${album.id}`,
              addedOn: addedAt ? releaseDayLong(addedAt) : null,
              waitedDays,
            });
          } catch (err) {
            // RELEASE THE CLAIM. The claim is taken before the send so two
            // overlapping runs can't both mail — but that means a send failure
            // (Resend down, a 429) would otherwise leave a row that blocks the
            // retry forever, and the user simply never hears about the album
            // they waited months for. Deleting it puts them back in tomorrow's
            // batch; the worst case flips from "never" to "twice".
            await db
              .delete(releaseNotices)
              .where(eq(releaseNotices.id, claimed.id));
            throw err;
          }
          await db
            .update(releaseNotices)
            .set({ emailSentAt: new Date() })
            .where(eq(releaseNotices.id, claimed.id));
          sent++;
        } catch (err) {
          console.error(
            `[cron/release] user ${owner.userId} / item ${album.id} failed:`,
            err,
          );
          failed++;
        }
      }
    } catch (err) {
      console.error(`[cron/release] item ${album.id} failed:`, err);
      failed++;
    }
  }

  return NextResponse.json({
    resolved,
    landed: landed.length,
    refreshed,
    sent,
    slipped,
    alreadySent,
    failed,
  });
}

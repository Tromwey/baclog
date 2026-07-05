import "server-only";
import { desc, sql } from "drizzle-orm";
import { db } from "@/db";
import { analyticsEvents } from "@/db/schema";

/** Geo × device breakdown, most-common first — the raw ADR-000 signal. */
export async function getGeoDeviceBreakdown() {
  return db
    .select({
      country: analyticsEvents.country,
      device: analyticsEvents.device,
      count: sql<number>`count(*)::int`,
    })
    .from(analyticsEvents)
    .groupBy(analyticsEvents.country, analyticsEvents.device)
    .orderBy(desc(sql`count(*)`))
    .limit(50);
}

/**
 * The ADR-000 question: are viewers (anonymous public-page traffic) coming
 * from the same geography/platform as signed-in users? Split public_* views
 * vs signed-in events, each broken down by country.
 */
export async function getViewerVsUserSplit() {
  return db
    .select({
      audience: sql<string>`case when ${analyticsEvents.eventType} in ('public_profile_view','public_backlog_view','public_item_view') then 'viewer' else 'user' end`,
      country: analyticsEvents.country,
      count: sql<number>`count(*)::int`,
    })
    .from(analyticsEvents)
    .groupBy(
      sql`case when ${analyticsEvents.eventType} in ('public_profile_view','public_backlog_view','public_item_view') then 'viewer' else 'user' end`,
      analyticsEvents.country,
    )
    .orderBy(desc(sql`count(*)`))
    .limit(50);
}

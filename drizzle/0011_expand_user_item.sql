CREATE TABLE "user_item" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"catalog_item_id" text NOT NULL,
	"status" "item_status" DEFAULT 'on_my_radar' NOT NULL,
	"status_changed_at" timestamp DEFAULT now() NOT NULL,
	"verdict" "item_verdict",
	"verdict_changed_at" timestamp,
	"obsessed" boolean DEFAULT false NOT NULL,
	"obsessed_at" timestamp,
	"source_cross_media_rec_id" text,
	"added_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cross_media_reco_feedback" ALTER COLUMN "backlog_item_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_item" ADD COLUMN "palette_hex" text[];--> statement-breakpoint
ALTER TABLE "cross_media_reco_feedback" ADD COLUMN "user_item_id" text;--> statement-breakpoint
ALTER TABLE "user_item" ADD CONSTRAINT "user_item_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_item" ADD CONSTRAINT "user_item_catalog_item_id_catalog_item_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_item" ADD CONSTRAINT "user_item_source_cross_media_rec_id_cross_media_rec_id_fk" FOREIGN KEY ("source_cross_media_rec_id") REFERENCES "public"."cross_media_rec"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_item_user_catalog_unique" ON "user_item" USING btree ("user_id","catalog_item_id");--> statement-breakpoint
CREATE INDEX "user_item_user_id_idx" ON "user_item" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_item_source_cross_media_rec_id_idx" ON "user_item" USING btree ("source_cross_media_rec_id");--> statement-breakpoint
ALTER TABLE "cross_media_reco_feedback" ADD CONSTRAINT "cross_media_reco_feedback_user_item_id_user_item_id_fk" FOREIGN KEY ("user_item_id") REFERENCES "public"."user_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- ============================================================================
-- Data backfill (staged like 0009→0010): all DDL above exists now, so move the
-- per-title state off backlog_item. The DROPs of the moved columns happen in
-- 0012, after this lands. Idempotent-ish: safe to re-run (only-if-null / insert
-- from source-of-truth), but meant to run once.
-- ============================================================================

-- (A) Palette → catalog_item. Cover-derived + identical across copies; newest
-- non-null wins. only-if-null so a re-run never clobbers a real value.
UPDATE "catalog_item" SET "palette_hex" = sub.hex
FROM (
  SELECT DISTINCT ON (catalog_item_id) catalog_item_id, palette_hex AS hex
  FROM "backlog_item"
  WHERE palette_hex IS NOT NULL
  ORDER BY catalog_item_id, added_at DESC
) sub
WHERE "catalog_item"."id" = sub.catalog_item_id
  AND "catalog_item"."palette_hex" IS NULL;--> statement-breakpoint

-- (B) Collapse backlog_item copies → one user_item per (user, title). Conflict
-- rules: latest copy wins for status/verdict (status_changed_at, then added_at);
-- obsessed = OR across copies; obsessed_at = most recent; added_at = earliest;
-- provenance = prefer non-null, earliest-added of those.
INSERT INTO "user_item" (
  "id", "user_id", "catalog_item_id", "status", "status_changed_at",
  "verdict", "verdict_changed_at", "obsessed", "obsessed_at",
  "source_cross_media_rec_id", "added_at"
)
SELECT
  gen_random_uuid()::text,
  latest.user_id, latest.catalog_item_id,
  latest.status, latest.status_changed_at,
  latest.verdict, latest.verdict_changed_at,
  agg.obsessed, agg.obsessed_at,
  prov.source_cross_media_rec_id,
  agg.added_at
FROM (
  SELECT DISTINCT ON (user_id, catalog_item_id)
    user_id, catalog_item_id, status, status_changed_at, verdict, verdict_changed_at
  FROM "backlog_item"
  ORDER BY user_id, catalog_item_id, status_changed_at DESC, added_at DESC
) latest
JOIN (
  SELECT user_id, catalog_item_id,
    bool_or(obsessed) AS obsessed,
    max(obsessed_at) FILTER (WHERE obsessed) AS obsessed_at,
    min(added_at) AS added_at
  FROM "backlog_item"
  GROUP BY user_id, catalog_item_id
) agg USING (user_id, catalog_item_id)
LEFT JOIN (
  SELECT DISTINCT ON (user_id, catalog_item_id)
    user_id, catalog_item_id, source_cross_media_rec_id
  FROM "backlog_item"
  WHERE source_cross_media_rec_id IS NOT NULL
  ORDER BY user_id, catalog_item_id, added_at ASC
) prov USING (user_id, catalog_item_id);--> statement-breakpoint

-- (C) Re-anchor reco feedback to the collapsed user_item (was per backlog_item).
UPDATE "cross_media_reco_feedback" f
SET "user_item_id" = ui.id
FROM "backlog_item" bi
JOIN "user_item" ui
  ON ui.user_id = bi.user_id AND ui.catalog_item_id = bi.catalog_item_id
WHERE f."backlog_item_id" = bi.id;--> statement-breakpoint

-- Two copies that each had feedback now collide on the per-title anchor 0012
-- will make unique; keep the newest (updated_at, then id) and drop the rest.
DELETE FROM "cross_media_reco_feedback" a
USING "cross_media_reco_feedback" b
WHERE a."user_item_id" = b."user_item_id"
  AND a."user_item_id" IS NOT NULL
  AND (a."updated_at" < b."updated_at"
       OR (a."updated_at" = b."updated_at" AND a."id" < b."id"));
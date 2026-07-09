CREATE TYPE "public"."item_reaction" AS ENUM('disliked', 'liked', 'obsessed');--> statement-breakpoint
CREATE TABLE "cross_media_reco_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"backlog_item_id" text NOT NULL,
	"user_id" text NOT NULL,
	"cross_media_rec_id" text NOT NULL,
	"reasons" text[] NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "backlog_item" ADD COLUMN "reaction" "item_reaction";--> statement-breakpoint
UPDATE "backlog_item" SET "reaction" = CASE
  WHEN "rating" = 5 THEN 'obsessed'
  WHEN "rating" = 4 THEN 'liked'
  WHEN "rating" BETWEEN 1 AND 3 THEN 'disliked'
  ELSE NULL
END::"item_reaction"
WHERE "rating" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "backlog_item" ADD COLUMN "source_cross_media_rec_id" text;--> statement-breakpoint
ALTER TABLE "cross_media_reco_feedback" ADD CONSTRAINT "cross_media_reco_feedback_backlog_item_id_backlog_item_id_fk" FOREIGN KEY ("backlog_item_id") REFERENCES "public"."backlog_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cross_media_reco_feedback" ADD CONSTRAINT "cross_media_reco_feedback_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cross_media_reco_feedback" ADD CONSTRAINT "cross_media_reco_feedback_cross_media_rec_id_cross_media_rec_id_fk" FOREIGN KEY ("cross_media_rec_id") REFERENCES "public"."cross_media_rec"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cross_media_reco_feedback_backlog_item_unique" ON "cross_media_reco_feedback" USING btree ("backlog_item_id");--> statement-breakpoint
CREATE INDEX "cross_media_reco_feedback_cross_media_rec_idx" ON "cross_media_reco_feedback" USING btree ("cross_media_rec_id");--> statement-breakpoint
ALTER TABLE "backlog_item" ADD CONSTRAINT "backlog_item_source_cross_media_rec_id_cross_media_rec_id_fk" FOREIGN KEY ("source_cross_media_rec_id") REFERENCES "public"."cross_media_rec"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "backlog_item_source_cross_media_rec_id_idx" ON "backlog_item" USING btree ("source_cross_media_rec_id");
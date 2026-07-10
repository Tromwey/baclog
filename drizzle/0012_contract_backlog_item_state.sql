ALTER TABLE "backlog_item" DROP CONSTRAINT "backlog_item_source_cross_media_rec_id_cross_media_rec_id_fk";
--> statement-breakpoint
ALTER TABLE "cross_media_reco_feedback" DROP CONSTRAINT "cross_media_reco_feedback_backlog_item_id_backlog_item_id_fk";
--> statement-breakpoint
DROP INDEX "backlog_item_source_cross_media_rec_id_idx";--> statement-breakpoint
DROP INDEX "cross_media_reco_feedback_backlog_item_unique";--> statement-breakpoint
ALTER TABLE "cross_media_reco_feedback" ALTER COLUMN "user_item_id" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "cross_media_reco_feedback_user_item_unique" ON "cross_media_reco_feedback" USING btree ("user_item_id");--> statement-breakpoint
ALTER TABLE "backlog_item" DROP COLUMN "status";--> statement-breakpoint
ALTER TABLE "backlog_item" DROP COLUMN "verdict";--> statement-breakpoint
ALTER TABLE "backlog_item" DROP COLUMN "verdict_changed_at";--> statement-breakpoint
ALTER TABLE "backlog_item" DROP COLUMN "obsessed";--> statement-breakpoint
ALTER TABLE "backlog_item" DROP COLUMN "obsessed_at";--> statement-breakpoint
ALTER TABLE "backlog_item" DROP COLUMN "source_cross_media_rec_id";--> statement-breakpoint
ALTER TABLE "backlog_item" DROP COLUMN "palette_hex";--> statement-breakpoint
ALTER TABLE "backlog_item" DROP COLUMN "status_changed_at";--> statement-breakpoint
ALTER TABLE "cross_media_reco_feedback" DROP COLUMN "backlog_item_id";
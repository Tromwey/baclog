ALTER TABLE "cross_media_rec_usage" ADD COLUMN "spent_no_match" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "cross_media_rec" ADD COLUMN "link_claim" text;
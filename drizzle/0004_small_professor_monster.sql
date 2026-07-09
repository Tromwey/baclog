ALTER TABLE "cross_media_rec" ADD COLUMN "prompt_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "cross_media_rec" ADD COLUMN "model" text;
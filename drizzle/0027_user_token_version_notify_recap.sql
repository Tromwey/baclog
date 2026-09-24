ALTER TABLE "user" ADD COLUMN "token_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "notify_recap" boolean DEFAULT true NOT NULL;
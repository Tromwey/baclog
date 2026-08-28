ALTER TABLE "backlog" ADD COLUMN "is_public" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "backlog" ADD COLUMN "show_on_profile" boolean DEFAULT true NOT NULL;
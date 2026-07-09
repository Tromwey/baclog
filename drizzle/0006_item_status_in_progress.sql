ALTER TYPE "public"."item_status" RENAME VALUE 'obsessing_over' TO 'in_progress';--> statement-breakpoint
UPDATE "backlog_item" SET "reaction" = 'obsessed' WHERE "status" = 'in_progress' AND "reaction" IS NULL;

CREATE TYPE "public"."item_verdict" AS ENUM('disliked', 'liked');--> statement-breakpoint
ALTER TABLE "backlog_item" ADD COLUMN "verdict" "item_verdict";--> statement-breakpoint
ALTER TABLE "backlog_item" ADD COLUMN "verdict_changed_at" timestamp;--> statement-breakpoint
ALTER TABLE "backlog_item" ADD COLUMN "obsessed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "backlog_item" ADD COLUMN "obsessed_at" timestamp;--> statement-breakpoint
-- Data backfill (F3.7 followup): split the old single `reaction` field into the
-- two INDEPENDENT axes. Runs between the ADDs above and the DROPs in 0010 — the
-- staged-generation precedent of 0005–0007. `obsessed_at`/`verdict_changed_at`
-- inherit `reaction_changed_at` (may be null; only 5 of 9 reacted rows had it).
UPDATE "backlog_item" SET "obsessed" = true, "obsessed_at" = "reaction_changed_at" WHERE "reaction" = 'obsessed';--> statement-breakpoint
UPDATE "backlog_item" SET "verdict" = "reaction"::text::"item_verdict", "verdict_changed_at" = "reaction_changed_at" WHERE "reaction" IN ('liked', 'disliked');--> statement-breakpoint
-- Retire custom status (F2.8): fold any surviving custom rows into in_progress
-- before 0010 drops custom_status_label. (0 rows today — defensive + future-proof.)
UPDATE "backlog_item" SET "status" = 'in_progress' WHERE "status" = 'custom';
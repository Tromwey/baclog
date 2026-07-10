-- ⚠️ CONTRACT PHASE — DO NOT APPLY UNTIL PROD IS ON THE NEW CODE. ⚠️
-- local/beta/prod share ONE Neon DB. These DROPs remove columns the CURRENTLY
-- DEPLOYED prod code (707dd42) still SELECTs (reaction, custom_status_label).
-- 0009 (expand) is already applied; this file is left PENDING on purpose.
-- Cutover order at prod ship: (1) `vercel --prod` so prod runs the verdict/
-- obsessed code, THEN (2) `npx drizzle-kit migrate` to apply this. Applying it
-- while old code is live 500s every backlog/item/public read.
ALTER TABLE "backlog_item" DROP COLUMN "custom_status_label";--> statement-breakpoint
ALTER TABLE "backlog_item" DROP COLUMN "reaction";--> statement-breakpoint
ALTER TABLE "backlog_item" DROP COLUMN "reaction_changed_at";--> statement-breakpoint
DROP TYPE "public"."item_reaction";
DROP INDEX "backlog_item_backlog_id_idx";--> statement-breakpoint
DROP INDEX "item_review_user_id_idx";--> statement-breakpoint
DROP INDEX "media_link_catalog_item_idx";--> statement-breakpoint
DROP INDEX "user_item_user_id_idx";--> statement-breakpoint
CREATE INDEX "backlog_item_catalog_item_idx" ON "backlog_item" USING btree ("catalog_item_id");--> statement-breakpoint
CREATE INDEX "user_item_catalog_item_idx" ON "user_item" USING btree ("catalog_item_id");
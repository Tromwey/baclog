CREATE TABLE "cross_media_link" (
	"id" text PRIMARY KEY NOT NULL,
	"video_catalog_item_id" text NOT NULL,
	"album_catalog_item_id" text NOT NULL,
	"link_type" text NOT NULL,
	"source" text NOT NULL,
	"meta" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "cross_media_rec_seed_unique";--> statement-breakpoint
ALTER TABLE "catalog_item" ADD COLUMN "link_edges_checked_at" timestamp;--> statement-breakpoint
ALTER TABLE "cross_media_rec" ADD COLUMN "link_type" text;--> statement-breakpoint
ALTER TABLE "cross_media_rec" ADD COLUMN "cross_media_link_id" text;--> statement-breakpoint
ALTER TABLE "cross_media_link" ADD CONSTRAINT "cross_media_link_video_catalog_item_id_catalog_item_id_fk" FOREIGN KEY ("video_catalog_item_id") REFERENCES "public"."catalog_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cross_media_link" ADD CONSTRAINT "cross_media_link_album_catalog_item_id_catalog_item_id_fk" FOREIGN KEY ("album_catalog_item_id") REFERENCES "public"."catalog_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cross_media_link_unique" ON "cross_media_link" USING btree ("video_catalog_item_id","album_catalog_item_id","link_type");--> statement-breakpoint
CREATE INDEX "cross_media_link_album_idx" ON "cross_media_link" USING btree ("album_catalog_item_id");--> statement-breakpoint
ALTER TABLE "cross_media_rec" ADD CONSTRAINT "cross_media_rec_cross_media_link_id_cross_media_link_id_fk" FOREIGN KEY ("cross_media_link_id") REFERENCES "public"."cross_media_link"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cross_media_rec_seed_target_unique" ON "cross_media_rec" USING btree ("seed_catalog_item_id","target_catalog_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cross_media_rec_thematic_seed_unique" ON "cross_media_rec" USING btree ("seed_catalog_item_id") WHERE "cross_media_rec"."link_type" is null or "cross_media_rec"."link_type" = 'thematic';--> statement-breakpoint
CREATE INDEX "cross_media_rec_link_id_idx" ON "cross_media_rec" USING btree ("cross_media_link_id");
CREATE TABLE "cross_media_rec_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"era_key" varchar(7) NOT NULL,
	"generations" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cross_media_rec" (
	"id" text PRIMARY KEY NOT NULL,
	"seed_catalog_item_id" text NOT NULL,
	"target_catalog_item_id" text NOT NULL,
	"hook_eyebrow" text NOT NULL,
	"hook_title" text NOT NULL,
	"result_eyebrow" text NOT NULL,
	"closer" text,
	"provider" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cross_media_rec_usage" ADD CONSTRAINT "cross_media_rec_usage_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cross_media_rec" ADD CONSTRAINT "cross_media_rec_seed_catalog_item_id_catalog_item_id_fk" FOREIGN KEY ("seed_catalog_item_id") REFERENCES "public"."catalog_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cross_media_rec" ADD CONSTRAINT "cross_media_rec_target_catalog_item_id_catalog_item_id_fk" FOREIGN KEY ("target_catalog_item_id") REFERENCES "public"."catalog_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cross_media_rec_usage_user_era_unique" ON "cross_media_rec_usage" USING btree ("user_id","era_key");--> statement-breakpoint
CREATE UNIQUE INDEX "cross_media_rec_seed_unique" ON "cross_media_rec" USING btree ("seed_catalog_item_id");--> statement-breakpoint
CREATE INDEX "cross_media_rec_target_idx" ON "cross_media_rec" USING btree ("target_catalog_item_id");
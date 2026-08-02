CREATE TABLE "release_notice" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"catalog_item_id" text NOT NULL,
	"email_sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "catalog_item" ADD COLUMN "release_date" timestamp;--> statement-breakpoint
ALTER TABLE "release_notice" ADD CONSTRAINT "release_notice_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_notice" ADD CONSTRAINT "release_notice_catalog_item_id_catalog_item_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "release_notice_user_item_unique" ON "release_notice" USING btree ("user_id","catalog_item_id");--> statement-breakpoint
CREATE INDEX "catalog_item_release_date_idx" ON "catalog_item" USING btree ("release_date");
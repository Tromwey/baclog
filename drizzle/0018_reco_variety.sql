CREATE TABLE "cross_media_rec_seen" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"cross_media_rec_id" text NOT NULL,
	"seen_at" timestamp DEFAULT now() NOT NULL,
	"dismissed_at" timestamp
);
--> statement-breakpoint
DROP INDEX "cross_media_rec_thematic_seed_unique";--> statement-breakpoint
ALTER TABLE "cross_media_rec_seen" ADD CONSTRAINT "cross_media_rec_seen_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cross_media_rec_seen" ADD CONSTRAINT "cross_media_rec_seen_cross_media_rec_id_cross_media_rec_id_fk" FOREIGN KEY ("cross_media_rec_id") REFERENCES "public"."cross_media_rec"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cross_media_rec_seen_user_rec_unique" ON "cross_media_rec_seen" USING btree ("user_id","cross_media_rec_id");--> statement-breakpoint
CREATE INDEX "cross_media_rec_seen_user_idx" ON "cross_media_rec_seen" USING btree ("user_id");
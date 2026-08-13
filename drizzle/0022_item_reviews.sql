ALTER TYPE "public"."report_reason" ADD VALUE 'unmarked_spoiler';--> statement-breakpoint
ALTER TYPE "public"."report_reason" ADD VALUE 'hate';--> statement-breakpoint
ALTER TYPE "public"."report_reason" ADD VALUE 'off_topic';--> statement-breakpoint
CREATE TABLE "item_review" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"catalog_item_id" text NOT NULL,
	"body" text NOT NULL,
	"has_spoiler" boolean DEFAULT false NOT NULL,
	"hidden_at" timestamp,
	"hidden_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "report" ADD COLUMN "target_review_id" text;--> statement-breakpoint
ALTER TABLE "report" ADD COLUMN "resolved_at" timestamp;--> statement-breakpoint
ALTER TABLE "report" ADD COLUMN "resolved_by_user_id" text;--> statement-breakpoint
ALTER TABLE "item_review" ADD CONSTRAINT "item_review_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_review" ADD CONSTRAINT "item_review_catalog_item_id_catalog_item_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_review" ADD CONSTRAINT "item_review_hidden_by_user_id_user_id_fk" FOREIGN KEY ("hidden_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "item_review_user_catalog_unique" ON "item_review" USING btree ("user_id","catalog_item_id");--> statement-breakpoint
CREATE INDEX "item_review_catalog_created_idx" ON "item_review" USING btree ("catalog_item_id","created_at");--> statement-breakpoint
CREATE INDEX "item_review_user_id_idx" ON "item_review" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "item_review_hidden_at_idx" ON "item_review" USING btree ("hidden_at");--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_target_review_id_item_review_id_fk" FOREIGN KEY ("target_review_id") REFERENCES "public"."item_review"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_resolved_by_user_id_user_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "report_target_review_id_idx" ON "report" USING btree ("target_review_id");
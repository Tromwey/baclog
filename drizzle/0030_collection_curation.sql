CREATE TABLE "backlog_collaborator" (
	"backlog_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "backlog_collaborator_backlog_id_user_id_pk" PRIMARY KEY("backlog_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "backlog_item" ADD COLUMN "position" integer;--> statement-breakpoint
ALTER TABLE "backlog" ADD COLUMN "pinned_at" timestamp;--> statement-breakpoint
ALTER TABLE "backlog" ADD COLUMN "cover_catalog_item_id" text;--> statement-breakpoint
ALTER TABLE "backlog_collaborator" ADD CONSTRAINT "backlog_collaborator_backlog_id_backlog_id_fk" FOREIGN KEY ("backlog_id") REFERENCES "public"."backlog"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backlog_collaborator" ADD CONSTRAINT "backlog_collaborator_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "backlog_collaborator_user_idx" ON "backlog_collaborator" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "backlog" ADD CONSTRAINT "backlog_cover_catalog_item_id_catalog_item_id_fk" FOREIGN KEY ("cover_catalog_item_id") REFERENCES "public"."catalog_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "backlog_one_pinned_per_user" ON "backlog" USING btree ("user_id") WHERE "backlog"."pinned_at" is not null;
ALTER TYPE "public"."media_type" ADD VALUE 'track';--> statement-breakpoint
CREATE TABLE "party" (
	"backlog_id" text PRIMARY KEY NOT NULL,
	"per_guest_limit" smallint,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "party_per_guest_limit_check" CHECK ("party"."per_guest_limit" is null or ("party"."per_guest_limit" >= 0 and "party"."per_guest_limit" <= 50))
);
--> statement-breakpoint
CREATE TABLE "party_invite" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"backlog_id" text NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "party_song" (
	"backlog_item_id" text PRIMARY KEY NOT NULL,
	"backlog_id" text NOT NULL,
	"added_by_user_id" text,
	"added_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "backlog_collaborator" ADD COLUMN "blocked_at" timestamp;--> statement-breakpoint
ALTER TABLE "backlog_collaborator" ADD COLUMN "left_at" timestamp;--> statement-breakpoint
ALTER TABLE "party" ADD CONSTRAINT "party_backlog_id_backlog_id_fk" FOREIGN KEY ("backlog_id") REFERENCES "public"."backlog"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_invite" ADD CONSTRAINT "party_invite_backlog_id_backlog_id_fk" FOREIGN KEY ("backlog_id") REFERENCES "public"."backlog"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_song" ADD CONSTRAINT "party_song_backlog_item_id_backlog_item_id_fk" FOREIGN KEY ("backlog_item_id") REFERENCES "public"."backlog_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_song" ADD CONSTRAINT "party_song_backlog_id_backlog_id_fk" FOREIGN KEY ("backlog_id") REFERENCES "public"."backlog"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_song" ADD CONSTRAINT "party_song_added_by_user_id_user_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "party_invite_token_unique" ON "party_invite" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "party_invite_one_active" ON "party_invite" USING btree ("backlog_id") WHERE "party_invite"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "party_song_backlog_adder_idx" ON "party_song" USING btree ("backlog_id","added_by_user_id");--> statement-breakpoint
CREATE INDEX "party_song_added_by_idx" ON "party_song" USING btree ("added_by_user_id");
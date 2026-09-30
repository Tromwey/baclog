CREATE TABLE "music_connection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"access_token_enc" text NOT NULL,
	"refresh_token_enc" text,
	"expires_at" timestamp NOT NULL,
	"scope" text,
	"external_user_id" text,
	"country_code" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "music_connection_provider_check" CHECK ("music_connection"."provider" in ('tidal'))
);
--> statement-breakpoint
CREATE TABLE "music_oauth_state" (
	"state_hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"client" text NOT NULL,
	"code_verifier_enc" text NOT NULL,
	"return_to" text,
	"code_enc" text,
	"claim_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "music_oauth_state_client_check" CHECK ("music_oauth_state"."client" in ('web', 'ios'))
);
--> statement-breakpoint
CREATE TABLE "party_export_item" (
	"export_id" uuid NOT NULL,
	"catalog_item_id" text NOT NULL,
	"outcome" text NOT NULL,
	"remote_track_id" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "party_export_item_export_id_catalog_item_id_pk" PRIMARY KEY("export_id","catalog_item_id"),
	CONSTRAINT "party_export_item_outcome_check" CHECK ("party_export_item"."outcome" in ('added', 'missing'))
);
--> statement-breakpoint
CREATE TABLE "party_export" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"backlog_id" text NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"remote_playlist_id" text,
	"remote_url" text,
	"generation" integer DEFAULT 0 NOT NULL,
	"generation_bumped_at" timestamp,
	"lease_until" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "party_export_provider_check" CHECK ("party_export"."provider" in ('apple_music', 'tidal'))
);
--> statement-breakpoint
ALTER TABLE "music_connection" ADD CONSTRAINT "music_connection_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "music_oauth_state" ADD CONSTRAINT "music_oauth_state_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_export_item" ADD CONSTRAINT "party_export_item_export_id_party_export_id_fk" FOREIGN KEY ("export_id") REFERENCES "public"."party_export"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_export_item" ADD CONSTRAINT "party_export_item_catalog_item_id_catalog_item_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_export" ADD CONSTRAINT "party_export_backlog_id_backlog_id_fk" FOREIGN KEY ("backlog_id") REFERENCES "public"."backlog"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_export" ADD CONSTRAINT "party_export_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "music_connection_user_provider_unique" ON "music_connection" USING btree ("user_id","provider");--> statement-breakpoint
CREATE INDEX "music_oauth_state_user_idx" ON "music_oauth_state" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "music_oauth_state_expires_idx" ON "music_oauth_state" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "party_export_backlog_user_provider_unique" ON "party_export" USING btree ("backlog_id","user_id","provider");--> statement-breakpoint
CREATE INDEX "party_export_user_idx" ON "party_export" USING btree ("user_id");
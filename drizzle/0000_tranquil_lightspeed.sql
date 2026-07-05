CREATE TYPE "public"."item_status" AS ENUM('on_my_radar', 'obsessing_over', 'completed', 'custom');--> statement-breakpoint
CREATE TYPE "public"."link_service" AS ENUM('spotify', 'apple_music', 'youtube_music', 'netflix', 'hulu', 'disney_plus', 'max', 'prime_video', 'other');--> statement-breakpoint
CREATE TYPE "public"."media_type" AS ENUM('film', 'series', 'album');--> statement-breakpoint
CREATE TYPE "public"."preferred_service" AS ENUM('spotify', 'apple_music', 'youtube_music');--> statement-breakpoint
CREATE TYPE "public"."report_reason" AS ENUM('spam', 'impersonation', 'harassment', 'illegal_content', 'other');--> statement-breakpoint
CREATE TABLE "account" (
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "account_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "backlog_item" (
	"id" text PRIMARY KEY NOT NULL,
	"backlog_id" text NOT NULL,
	"user_id" text NOT NULL,
	"catalog_item_id" text NOT NULL,
	"status" "item_status" DEFAULT 'on_my_radar' NOT NULL,
	"custom_status_label" text,
	"rating" smallint,
	"palette_hex" text[],
	"added_at" timestamp DEFAULT now() NOT NULL,
	"status_changed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "backlog" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"vibe" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_item" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"media_type" "media_type" NOT NULL,
	"title" text NOT NULL,
	"byline" text,
	"year" smallint,
	"genre" text,
	"synopsis" text,
	"poster_url" text,
	"source_rating" real,
	"isrc" text,
	"upc" text,
	"raw" jsonb,
	"refreshed_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_link" (
	"id" text PRIMARY KEY NOT NULL,
	"catalog_item_id" text NOT NULL,
	"service" "link_service" NOT NULL,
	"region" varchar(8),
	"url" text NOT NULL,
	"is_search_fallback" boolean DEFAULT false NOT NULL,
	"resolved_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report" (
	"id" text PRIMARY KEY NOT NULL,
	"reporter_user_id" text,
	"target_user_id" text NOT NULL,
	"reason" "report_reason" NOT NULL,
	"details" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"email_verified" timestamp,
	"name" text,
	"image" text,
	"birth_year" smallint,
	"is_minor" boolean DEFAULT false NOT NULL,
	"preferred_service" "preferred_service",
	"username" varchar(30),
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verificationToken" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verificationToken_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backlog_item" ADD CONSTRAINT "backlog_item_backlog_id_backlog_id_fk" FOREIGN KEY ("backlog_id") REFERENCES "public"."backlog"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backlog_item" ADD CONSTRAINT "backlog_item_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backlog_item" ADD CONSTRAINT "backlog_item_catalog_item_id_catalog_item_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backlog" ADD CONSTRAINT "backlog_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_link" ADD CONSTRAINT "media_link_catalog_item_id_catalog_item_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_reporter_user_id_user_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_target_user_id_user_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "backlog_item_backlog_id_idx" ON "backlog_item" USING btree ("backlog_id");--> statement-breakpoint
CREATE INDEX "backlog_item_user_id_idx" ON "backlog_item" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "backlog_item_unique_per_backlog" ON "backlog_item" USING btree ("backlog_id","catalog_item_id");--> statement-breakpoint
CREATE INDEX "backlog_user_id_idx" ON "backlog" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_item_source_external_unique" ON "catalog_item" USING btree ("source","external_id");--> statement-breakpoint
CREATE INDEX "catalog_item_media_type_idx" ON "catalog_item" USING btree ("media_type");--> statement-breakpoint
CREATE UNIQUE INDEX "media_link_unique" ON "media_link" USING btree ("catalog_item_id","service","region");--> statement-breakpoint
CREATE INDEX "media_link_catalog_item_idx" ON "media_link" USING btree ("catalog_item_id");--> statement-breakpoint
CREATE INDEX "report_target_user_id_idx" ON "report" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_email_unique" ON "user" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "user_username_unique" ON "user" USING btree ("username");
CREATE TYPE "public"."analytics_event_type" AS ENUM('session_view', 'public_profile_view', 'public_backlog_view', 'public_item_view', 'card_share');--> statement-breakpoint
CREATE TYPE "public"."device_class" AS ENUM('ios', 'android', 'desktop', 'other');--> statement-breakpoint
CREATE TABLE "analytics_event" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type" "analytics_event_type" NOT NULL,
	"user_id" text,
	"target_username" varchar(30),
	"country" varchar(2),
	"device" "device_class" DEFAULT 'other' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recap_send" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"era_key" varchar(7) NOT NULL,
	"email_sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waitlist_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"referral_code" varchar(12) NOT NULL,
	"referred_by_entry_id" text,
	"sequence" integer NOT NULL,
	"referral_count" integer DEFAULT 0 NOT NULL,
	"converted_user_id" text,
	"converted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waitlist_referral" (
	"id" text PRIMARY KEY NOT NULL,
	"referrer_entry_id" text NOT NULL,
	"referee_entry_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "is_founder" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "founder_rank" integer;--> statement-breakpoint
ALTER TABLE "analytics_event" ADD CONSTRAINT "analytics_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recap_send" ADD CONSTRAINT "recap_send_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entry" ADD CONSTRAINT "waitlist_entry_converted_user_id_user_id_fk" FOREIGN KEY ("converted_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_referral" ADD CONSTRAINT "waitlist_referral_referrer_entry_id_waitlist_entry_id_fk" FOREIGN KEY ("referrer_entry_id") REFERENCES "public"."waitlist_entry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_referral" ADD CONSTRAINT "waitlist_referral_referee_entry_id_waitlist_entry_id_fk" FOREIGN KEY ("referee_entry_id") REFERENCES "public"."waitlist_entry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analytics_event_type_created_idx" ON "analytics_event" USING btree ("event_type","created_at");--> statement-breakpoint
CREATE INDEX "analytics_event_country_idx" ON "analytics_event" USING btree ("country");--> statement-breakpoint
CREATE UNIQUE INDEX "recap_send_user_era_unique" ON "recap_send" USING btree ("user_id","era_key");--> statement-breakpoint
CREATE INDEX "recap_send_era_key_idx" ON "recap_send" USING btree ("era_key");--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_entry_email_unique" ON "waitlist_entry" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_entry_referral_code_unique" ON "waitlist_entry" USING btree ("referral_code");--> statement-breakpoint
CREATE INDEX "waitlist_entry_referred_by_idx" ON "waitlist_entry" USING btree ("referred_by_entry_id");--> statement-breakpoint
CREATE INDEX "waitlist_entry_sequence_idx" ON "waitlist_entry" USING btree ("sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_referral_referee_unique" ON "waitlist_referral" USING btree ("referee_entry_id");--> statement-breakpoint
CREATE INDEX "waitlist_referral_referrer_idx" ON "waitlist_referral" USING btree ("referrer_entry_id");
CREATE TYPE "public"."apns_environment" AS ENUM('sandbox', 'production');--> statement-breakpoint
CREATE TABLE "device_token" (
	"token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"session_id" uuid,
	"environment" "apns_environment" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "follow_push_notice" (
	"follower_user_id" text NOT NULL,
	"followed_user_id" text NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "follow_push_notice_follower_user_id_followed_user_id_pk" PRIMARY KEY("follower_user_id","followed_user_id")
);
--> statement-breakpoint
CREATE TABLE "mobile_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"platform" text NOT NULL,
	"device_name" text NOT NULL,
	"app_version" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "notify_followers" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "device_token" ADD CONSTRAINT "device_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_token" ADD CONSTRAINT "device_token_session_id_mobile_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."mobile_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_push_notice" ADD CONSTRAINT "follow_push_notice_follower_user_id_user_id_fk" FOREIGN KEY ("follower_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_push_notice" ADD CONSTRAINT "follow_push_notice_followed_user_id_user_id_fk" FOREIGN KEY ("followed_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobile_session" ADD CONSTRAINT "mobile_session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "device_token_user_idx" ON "device_token" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "device_token_session_idx" ON "device_token" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "follow_push_notice_followed_idx" ON "follow_push_notice" USING btree ("followed_user_id");--> statement-breakpoint
CREATE INDEX "mobile_session_user_idx" ON "mobile_session" USING btree ("user_id");
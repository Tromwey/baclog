CREATE TABLE "party_rsvp" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_slug" text NOT NULL,
	"guest_token" text NOT NULL,
	"name" text NOT NULL,
	"attending" boolean NOT NULL,
	"plus_one" boolean DEFAULT false NOT NULL,
	"plus_name" text,
	"diets" text[] DEFAULT '{}'::text[] NOT NULL,
	"drink" text,
	"costume" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "party_rsvp_event_guest_unique" ON "party_rsvp" USING btree ("event_slug","guest_token");
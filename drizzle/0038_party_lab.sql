-- Sellos del laberinto de /party. Aditiva: tres tablas nuevas, sin FK a "user".
-- Escrita idempotente (IF NOT EXISTS) a mano: se puede aplicar suelta, antes que 0036/0037,
-- y `drizzle-kit migrate` la vuelve a correr después sin fallar.
CREATE TABLE IF NOT EXISTS "party_lab_player" (
	"device_id" text PRIMARY KEY NOT NULL,
	"event_slug" text NOT NULL,
	"apodo" text,
	"apodo_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "party_lab_attempt" (
	"token" text PRIMARY KEY NOT NULL,
	"device_id" text NOT NULL,
	"lapida" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"respuesta" jsonb,
	CONSTRAINT "party_lab_attempt_device_id_party_lab_player_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."party_lab_player"("device_id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "party_lab_seal" (
	"device_id" text NOT NULL,
	"lapida" text NOT NULL,
	"won_at" timestamp DEFAULT now() NOT NULL,
	"delivered_at" timestamp,
	"ms" integer,
	CONSTRAINT "party_lab_seal_device_id_lapida_pk" PRIMARY KEY("device_id","lapida"),
	CONSTRAINT "party_lab_seal_device_id_party_lab_player_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."party_lab_player"("device_id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "party_lab_attempt_device_idx" ON "party_lab_attempt" USING btree ("device_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "party_lab_player_event_idx" ON "party_lab_player" USING btree ("event_slug");

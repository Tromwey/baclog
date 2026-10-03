-- Ouija del Mausoleo: por jugador, cuántas veces ha salido cada grupo de mensajes (para dar el siguiente).
-- Aditiva e idempotente; `party_lab_player` es de 0038.
ALTER TABLE "party_lab_player" ADD COLUMN IF NOT EXISTS "ouija" jsonb;

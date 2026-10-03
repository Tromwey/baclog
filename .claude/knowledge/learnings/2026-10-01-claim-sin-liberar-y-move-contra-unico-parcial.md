---
id: 2026-10-01-claim-sin-liberar-y-move-contra-unico-parcial
domain: backend
guardrail: scripts/db-harness/run.ts (`pnpm test:db`, Postgres local) + scripts/check-merge-coverage.ts (índices únicos de tablas `move`)
status: resolved
---

# Dos escrituras "idempotentes" que dejaban a alguien fuera para siempre: el claim que no se libera y el move que choca con un único parcial

## Síntoma
- **Recap mensual**: si `sendRecapEmail` (o armar el recap) fallaba para un usuario, el run contaba `failed`, respondía **200** y ese usuario no recibía el recap de ese mes nunca — un re-run lo saltaba como "ya enviado".
- **Estrenos**: un `release_notice` cuyo envío falló y no se pudo borrar, o cuyo run murió entre el claim y el correo, bloqueaba a ese usuario para ese título para siempre (`email_sent_at IS NULL`, sin nada detrás). Y los push salían en un solo lote al final: un run cortado por `maxDuration` mandaba los correos y ningún push.
- **Fusionar cuentas**: con una colección fijada en CADA cuenta, la fusión abortaba entera con `23505 backlog_one_pinned_per_user`. Se veía como "no se pudo fusionar", sin pista.

## Causa raíz
- El claim (`INSERT … ON CONFLICT DO NOTHING RETURNING`) se toma ANTES del envío para que dos runs no manden doble. Eso lo convierte en "hecho" aunque el envío falle: sin un `DELETE` del claim en el `catch`, idempotente significa "nunca". El de estrenos ya lo liberaba; el del recap no, y ninguno sabía qué hacer con un claim huérfano.
- `UPDATE backlog SET user_id = D WHERE user_id = O` parece inocuo porque `backlog` no tiene único por nombre. Pero un índice único PARCIAL sobre `user_id` (`WHERE pinned_at IS NOT NULL`) es "una fila por usuario": mover filas entre usuarios lo puede violar. El guardrail de cobertura solo miraba QUÉ tablas se movían, no sus índices.

## Prevención
- Los crons pasan por `deliverOnce` (`src/lib/cron.ts`): reclamar → enviar → liberar si lanza. Un claim sin `email_sent_at` más viejo que `STALE_CLAIM` cuenta como pendiente y se adopta en la misma sentencia del claim (`ON CONFLICT DO UPDATE … WHERE email_sent_at IS NULL AND created_at <= …`). 500 cuando alguien no fue avisado.
- `pnpm test:db` corre los dos route handlers reales contra un Postgres local: fallo de correo → claim liberado + 500, el siguiente run reintenta solo a ese usuario; claim viejo adoptado; claim fresco y enviado respetados; fusión con dos fijadas.
- `check-merge-coverage` falla si una tabla `move` tiene un índice único que incluye la columna de usuario y `merge.ts` no lo nombra.
- Callejones: (1) "el claim ya garantiza una sola vez" — garantiza A LO MÁS una vez; al menos una vez es el `release`. (2) Sellar `email_sent_at` dentro del mismo `try` que el envío: si el sello falla, liberar el claim manda el correo dos veces; el sello va aparte (`stampFailed`). (3) "La tabla no tiene únicos por usuario": mirar también los parciales y las PK compuestas.

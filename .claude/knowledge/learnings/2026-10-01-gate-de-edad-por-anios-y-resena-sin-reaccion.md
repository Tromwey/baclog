---
id: 2026-10-01-gate-de-edad-por-anios-y-resena-sin-reaccion
domain: security
guardrail: src/modules/account/age.test.ts (pnpm test) · scripts/db-harness/run.ts (pnpm test:db, casos "reseña…", "quitar reacción…", "gate de edad exacto")
status: resolved
---

# Dos reglas que solo se cumplían "al entrar": el gate de 13+ comparaba años, y la reseña sobrevivía a la reacción que la desbloqueó

## Síntoma
- Alguien de 12 que cumple 13 más adelante este año pasaba el onboarding (`año actual − birthYear < 13` es falso
  para él): hasta doce meses por debajo del mínimo.
- Reseñar exige reaccionar (`obsessed || verdict`), pero quitar la reacción después dejaba la reseña publicada, con
  un glifo de reacción leído de un `user_item` que ya no tenía ninguna.

## Causa raíz
Las dos reglas se evaluaban UNA vez, en el punto de entrada, con menos información de la que la regla necesita:
- la edad con un dato que no la determina (el año acota la edad a dos valores; en el borde, 12 o 13);
- el desbloqueo de la reseña en `saveReview` (leer reacción → insertar, dos round trips sin lock), y ninguna de las
  escrituras que APAGAN la reacción sabía que había algo colgando de ella (no hay FK de `item_review` a `user_item`).

## Prevención
- Edad: `decideAge` (`src/modules/account/age.ts`, puro) recibe la fecha completa y `now`; solo el AÑO sale hacia
  `birth_year`. El campo legado `birthYear` tiene tres tramos y el ambiguo (diferencia = 13) NO se resuelve hacia
  ningún lado: 400 pidiendo la fecha, sin escribir ni bloquear. Callejón sin salida: bloquear al ambiguo (`is_minor`
  es permanente y la mitad tiene 13) o dejarlo pasar (era el hueco).
- No valides rangos con `new Date()` evaluado al importar (`z.number().max(new Date().getFullYear())`): en una
  instancia caliente el "año actual" queda congelado. La decisión toma `now` como argumento.
- Reseña: el invariante lo hace cumplir UNA sentencia, `sweepUnreactedReview`, como último ítem del mismo
  `db.batch` que el UPDATE y tras `titleStateLock`. La condición la evalúa Postgres sobre la fila ya escrita por esa
  transacción — no la app sobre una lectura previa (neon-http no deja leer entre sentencias de un batch, y
  `setMark` lee ANTES del lock). `saveReview` cierra con la misma sentencia: gana quien corre segundo.
- Una ruta nueva que apague `verdict`/`obsessed` y no termine con el sweep rompe el invariante: el harness lo mide
  globalmente (0 reseñas sin reacción).
- Al cambiar el orden de las escrituras por eje en un cliente (web: `setObsessedAction(false)` y
  `clearVerdictAction` son llamadas separadas): pasar de una reacción a otra tiene que ENCENDER la nueva antes de
  apagar la vieja, o el estado intermedio "sin reacción" borra la reseña.

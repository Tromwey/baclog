---
id: 2026-09-24-un-reintento-no-basta-con-ventana-deslizante
domain: backend
guardrail: scripts/api-smoke.ts (`qaCall` = `e2call`/`e3call`: reintenta tras `Retry-After` hasta 6 veces, ≥ 2 s cada una, tope 90 s)
status: resolved
---

# El smoke `writes` vuelve a morir con `429 !== 200` aunque `e2call`/`e3call` ya "reintentan tras 429"

## Síntoma
Al sumar un caso nuevo de escrituras (R0, fase 4a: 6 writes más), `--only writes` aborta en un caso de E3 con
`esperaba 200, llegó 429 … "retryAfterSeconds":1`. En el log se ven decenas de líneas `(429 en … — espero 1s)`
seguidas, y el caso que falla es uno que YA pasó por el reintento. Como el runner sale en el primer FAIL, la cuenta
`qa-api-…` quedó viva en la DB (= prod) y hubo que borrarla por SQL.

## Causa raíz
El rate limit de `withApi` es una **ventana deslizante** de 60 escrituras/min por `sub`. `Retry-After` dice cuándo
expira la escritura MÁS VIEJA de la ventana: esperar eso libera **un solo hueco**. El helper del learning anterior
(`2026-09-24-smoke-writes-compartido-rebasa-rate-limit-por-usuario`) esperaba ese segundo y reintentaba UNA vez; en
cuanto un caso hace dos o más escrituras seguidas con la ventana llena, la segunda vuelve a chocar y el reintento
único devuelve el 429 al assert. Con E1+E2+E3 la ventana iba justa; cualquier caso nuevo la rebasa.

## Prevención
- Un solo helper para toda la cuenta QA, `qaCall` (`e2call` y `e3call` son alias): reintenta mientras la respuesta sea
  429, esperando `max(2, Retry-After)` s, hasta 6 veces y 90 s en total. Acotado a propósito: un 429 que no cede en
  90 s sí es un bug y debe fallar.
- Guardrail: el propio smoke (`--only writes` pasa con R0 incluido, 28 ok · 0 skipped).
- El callejón sin salida: subir `RATE_LIMIT_WRITES` o repartir los casos en "minutos" con sleeps fijos. El límite es
  producto; el smoke se adapta. Tampoco "arreglar" el endpoint del caso que falló: no tiene nada.
- Tras cualquier FAIL de `writes`: `select email from "user" where email like 'qa-api-%'` y borrar lo que quede.

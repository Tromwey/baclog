---
id: 2026-10-01-codigo-fijo-tope-por-codigo-no-acota
domain: security
guardrail: src/auth/otp-policy.test.ts ("App Review demo account: the guess bound does not depend on origins or issuances", "per-IP limiter keys are the NETWORK…", "safe-log: a query failure never prints its params") · scripts/otp-sql-harness.ts caso 8 (manual, Postgres desechable en loopback)
status: resolved
---

# "N intentos por código" no acota nada si el código es fijo y emitir es gratis

## Síntoma
Tras el ciclo 2 (presupuestos por (correo, origen)), la cuenta demo de App Review — código FIJO, sin topes
horarios de emisión — quedó fuerza-bruteable: cada origen nuevo pedía "su" código (el mismo de siempre) y
estrenaba 5 intentos. Con un bloque IPv6 (un /48 = 65 536 redes /64) eran intentos ilimitados contra seis
dígitos que nunca cambian. De paso, su `otp/request` respondía más rápido que el de cualquier otro correo (no
esperaba a Resend): un cronómetro decía cuál dirección tiene el código fijo.

## Causa raíz
La cota "15 códigos × 5 intentos + 10" presupone dos cosas que la cuenta demo no cumple: que emitir tiene tope
y que cada código emitido es OTRO secreto. Al quitarle los topes de emisión (varios revisores la comparten) el
contador por código se volvió un contador por origen, y el origen lo fabrica quien ataca. Un límite que se
reinicia con algo que el atacante puede crear no es un límite.

## Prevención
- Un secreto que no rota se acota por INTENTOS FALLIDOS totales sobre el recurso, entre todos los orígenes, en
  la DB: `reviewGuessSql` reserva un cupo atómicamente ANTES de comparar (lock + `INSERT … WHERE count < 20`),
  el acierto lo devuelve, el fallo lo conserva una hora. Así el uso legítimo (quien sabe el código) no gasta.
- Residuo inherente y escrito: quien gaste los 20 deja fuera a los revisores una hora. Con secreto fijo se
  elige entre eso y la fuerza bruta.
- Pregunta de revisión para cualquier contador: ¿qué lo reinicia, y quién puede provocar ese reinicio?
- La latencia también es una respuesta: si una rama hace I/O que otra no, el trabajo lento va a
  `afterResponse` para TODAS (el correo del OTP ahora sale después de responder).
- Los cubos por IP se llavean por la misma red que el origen del OTP (`clientIpOf` devuelve
  `networkAddress`): un cubo por dirección IPv6 completa era el mismo error a otra escala.
- Trampa del harness en macOS: `LC_ALL=en_US.UTF-8` y `-c unix_socket_directories=''` (el path del
  scratchpad no cabe en un socket Unix, y sin locale el postmaster muere al arrancar).

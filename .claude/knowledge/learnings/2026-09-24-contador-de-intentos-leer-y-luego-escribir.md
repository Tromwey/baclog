---
id: 2026-09-24-contador-de-intentos-leer-y-luego-escribir
domain: security
guardrail: none (no hay runner de tests con DB; verificado a mano contra un Postgres 17 local desechable — 30 intentos en paralelo gastan exactamente 5. Repetir esa prueba si se toca `consumeCode` en src/auth/otp.ts)
status: resolved
---

# El tope de "5 intentos por código" no aguantaba intentos en paralelo (login y fusión)

## Síntoma
Nadie lo vio en producción: salió en la revisión de seguridad de la fase 4g (código para fusionar cuentas).
Con ráfagas de intentos en paralelo contra el mismo código de 6 dígitos, cada código aguantaba unas 60
adivinanzas o más, no 5. Pasaba también con el OTP de login, que usa la misma función.

## Causa raíz
`verifyOtp` leía la fila (`SELECT … WHERE identifier AND token = hash(code)`) y, si fallaba, hacía
`UPDATE attempts + 1` y luego `DELETE … WHERE attempts >= 5`: tres sentencias separadas. Todas las
peticiones en vuelo leían la fila ANTES de que cayera el quinto incremento, así que cada una contaba como
"todavía hay intentos". El tope solo era real para peticiones en serie. Además, el código de fusión tenía
cooldown por (cuenta que pide, correo): K cuentas atacantes multiplicaban por K los intentos contra un
mismo correo.

## Prevención
- Cada intento es UNA sentencia atómica que comprueba el tope y gasta el intento a la vez:
  `UPDATE "verificationToken" SET attempts = attempts + 1 WHERE identifier = $1 AND attempts < 5 AND
  expires > $2 RETURNING token`. Si no vuelve ninguna fila, el intento falló. El hash se compara en la app
  con `timingSafeEqual`, y solo el acierto borra con `DELETE … WHERE identifier AND token RETURNING`, que
  deja un único ganador (`consumeCode` en `src/auth/otp.ts`, compartido por login y fusión).
- Códigos de fusión: tope de 3 por hora por CORREO DESTINO, sumando todas las cuentas que los pidan. Las
  filas viven 1 h aunque el código solo sirva 10 min, y las filas señuelo cuentan igual para que el tope no
  revele si la cuenta existe. La coincidencia con el correo es sin LIKE (`_` es comodín).
- Guardrail: ninguno ejecutable, porque el repo no tiene runner con DB. La prueba de carrera (30 `psql` en
  paralelo sobre una fila → 5 filas devueltas) se hizo a mano sobre un Postgres local desechable.
- El callejón sin salida: "ya hay tope de 5 y un cooldown de 60 s". Un tope que se lee en una sentencia y
  se escribe en otra no es un tope bajo concurrencia; y un cooldown por solicitante no limita al objetivo.

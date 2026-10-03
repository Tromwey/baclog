# Un marcador que cuenta "emisiones" también cobra los envíos que fallaron (y `afterResponse` logueaba el error entero)

**Fecha:** 2026-10-01 (ronda 4 de fixes, carril seguridad)

## Qué pasó
Dos cosas chicas del mismo flujo (el OTP que se envía después de responder):

1. El marcador `otp-issued:` hacía dos trabajos: cooldown (60 s) y tope por hora (5 por origen, 15 por
   correo). Cuando Resend fallaba se retiraba el código pero el marcador se quedaba, así que el fallo
   NUESTRO le costaba presupuesto al dueño: cinco envíos fallidos = hasta una hora sin poder pedir código.
2. `afterResponse` hacía `console.error(label, err)`. Sus tareas escriben el refresh token de Apple y
   tokens de dispositivo; un `DrizzleQueryError` lleva los valores ligados en `message` y en `.params`.
   La ronda 3 ya había limpiado el OTP, pero el helper genérico seguía imprimiendo el objeto.

## Por qué una persona razonable cae
- "El contador se incrementa al emitir" suena correcto; el fallo llega después de responder, en otro
  bloque, y nadie conecta "retirar el código" con "devolver el cupo".
- Un helper de "nunca lances, solo loguea" parece el lugar más seguro del repo; es justo el que ve los
  errores de TODAS las escrituras diferidas.

## Guardrail
- `withdrawUnsentSql` (`src/auth/otp-sql.ts`): el marcador se MUEVE a `otp-unsent:` con vida = cooldown.
  Cubierto por `otp-policy.test.ts` ("a failed send gives the issuance back…") y por el caso 9 de
  `scripts/otp-sql-harness.ts`.
- `afterResponse` → `redactedError`. Test "safe-log: what afterResponse prints…".
- Barrido (debe salir vacío):
  `grep -rnE "console\.(error|warn)\(.*, ?(err|cause|e)\b" src/auth src/authz src/lib/after-response.ts src/app/api/auth | grep -v safe-log.ts`

## Regla
Si una fila sirve para limitar Y el evento que cuenta puede fallar por culpa nuestra, el fallo tiene que
devolver el cupo (conservando solo lo que frena una tormenta de reintentos). Y a un `console.error`
nunca se le pasa un objeto error: una cadena con `errorTag`/`redactedError`.

# Un timeout del mailer no es "el correo no salió" (y un `Error` sin `code` deja el log mudo)

**Fecha:** 2026-10-01 (ronda 5 de fixes, carril seguridad)

## Qué pasó
1. `issueOtp` retiraba el código y devolvía la emisión ante CUALQUIER error del mailer, incluido el abort a
   10 s de `AbortSignal.timeout`. Un timeout no dice si Resend aceptó la petición: el correo podía llegar
   con un código que ya habíamos borrado ("código incorrecto" con el código correcto en la mano).
2. `mailer.ts` lanzaba `new Error("Resend failed: 403 <cuerpo>")` y el log imprimía `errorTag(err)` = `Error`.
   Con la llave perdida o un 401/429 de Resend, producción decía "mail not sent: Error" y nada más.
3. El reembolso de la ronda 4 dejó los marcadores `otp-unsent:` vivos solo 60 s: una dirección que Resend
   rechaza en síncrono valía 60 emisiones/h por origen, con llamada a Resend en cada una.

## Por qué una persona razonable cae
"Falló el envío → nadie recibió el código" es cierto para un 4xx y falso para un timeout; el `catch` no los
distingue si el error no trae con qué. Y redactar el error (bien) sin darle un `code` (mal) borra el
diagnóstico junto con el dato sensible.

## Guardrail
- `src/auth/mail-failure.ts`: `MailerError.code` (`no_api_key` · `resend_<status>` · `timeout` · `network`) y
  `mailCertainlyNotSent(err)` — lo desconocido NO cuenta como "no enviado". Test "mailer failures: a safe
  code for the log…" (`otp-policy.test.ts`).
- Tope `LOGIN_UNSENT_PER_ORIGIN_PER_HOUR` (20) en el gate; test "refused sends have a loose hourly cap…" y
  casos 11 (login) y 12 (fusión) de `scripts/otp-sql-harness.ts`.

## Regla
Compensar un efecto externo solo cuando el fallo PRUEBA que no ocurrió; la duda se queda del lado de "pudo
ocurrir". Todo error que se loguea redactado lleva un `code` de vocabulario cerrado. Y un reembolso de
cupo necesita su propio tope: si no, el fallo se vuelve la vía barata.

## Hueco
Ni `issueOtp` ni el `send` de fusión se ejercitaron contra la app corriendo con Resend fallando: cubierto
el clasificador (puro) y el SQL (harness), no el cableado `afterResponse` → `catch` (lectura de código).

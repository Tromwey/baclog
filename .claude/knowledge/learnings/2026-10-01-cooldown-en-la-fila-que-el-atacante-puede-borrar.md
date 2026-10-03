---
id: 2026-10-01-cooldown-en-la-fila-que-el-atacante-puede-borrar
domain: security
guardrail: src/auth/otp-policy.test.ts (`pnpm tsx --test src/auth/otp-policy.test.ts` — lógica pura de cooldown/tope) · el SQL del gate NO tiene test con DB (verificado a mano contra un Postgres 17 local desechable; repetir si se toca `issueOtp`)
status: resolved
---

# El cooldown del OTP de login vivía en la fila del código, y gastar los 5 intentos la borraba

## Síntoma
Nadie lo vio en producción: salió en la auditoría de seguridad. El "un código por minuto" y el "5 intentos por
código" se anulaban entre sí: 5 intentos fallidos → pedir otro código al instante → otros 5, sin esperar. Y N
peticiones `issueOtp` en paralelo dejaban N códigos válidos para el mismo correo (cada uno con sus 5 intentos).

## Causa raíz
El único reloj del cooldown era `expires` de la fila del código vivo (`issuedAt = expires - TTL`), leído con un
SELECT antes de borrar e insertar. Dos fallas sobre ese mismo dato:
1. `consumeCode` borraba la fila al llegar al tope de intentos ("para que se pueda pedir otro enseguida") — y con
   ella, el reloj. Quien adivina controlaba cuándo se reiniciaba el límite.
2. Leer → borrar → insertar eran tres sentencias: todas las peticiones en vuelo leían "no hay fila reciente" antes
   de que cayera el primer INSERT, y la PK `(identifier, token)` no impide varias filas por correo.
Tampoco había tope por hora: el cooldown solo era de 60 s.

## Prevención
- El límite se cuenta en filas que el limitado NO puede tocar: un MARCADOR por emisión
  (`otp-issued:<sha256(correo)>`, vive 1 h, solo lo borra el barrido de vencidos). Cooldown y tope por hora salen de
  los marcadores; la fila del código puede gastarse, vencer o reemplazarse sin mover ningún reloj.
- Decidir y armar es UNA transacción (`db.batch`) serializada por correo con `pg_advisory_xact_lock`: el INSERT del
  marcador lleva las dos condiciones en su WHERE y es el gate; borrar el código viejo e insertar el nuevo solo
  ocurren si ese INSERT ocurrió. 30 emisiones en paralelo → 1 código vivo, 1 marcador.
- `consumeCode` ya no borra en el tope (la fila queda muerta hasta vencer o ser reemplazada).
- El callejón sin salida: "ya hay cooldown en DB y tope de intentos". Dos límites que comparten una fila no son dos
  límites si alcanzar uno borra la fila. Pregunta de revisión: ¿quién puede borrar o reescribir el dato del que
  sale este límite, y con qué acción?
- Instantes en `sql` crudo: `${iso}::timestamp` (learning 2026-09-02-date-crudo-en-sql-template-pierde-offset).

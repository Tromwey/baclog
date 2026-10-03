---
id: 2026-10-01-limite-por-victima-es-un-interruptor-para-terceros
domain: security
guardrail: src/auth/otp-policy.test.ts ("a stranger's requests do not put the owner on cooldown…", "guesses: exhaustive adversary…", "THE BOUND") · scripts/otp-sql-harness.ts (manual, Postgres desechable en loopback — corre las sentencias reales de src/auth/otp-sql.ts)
status: resolved
---

# Un límite contado por la VÍCTIMA (correo) lo gasta cualquiera: el fix de fuerza bruta se volvió un bloqueo de cuenta

## Síntoma
Tras el ciclo 1 (5 códigos/hora por correo + 5 intentos matan el código vivo), un tercero anónimo podía dejar a
cualquier cuenta sin entrar por correo: 5 `POST …/otp/request` con el correo ajeno agotaban la hora, y 5 códigos
malos mataban el código que el dueño acababa de recibir. Sin sesión, sin costo, repetible cada hora.

## Causa raíz
Los dos contadores (emisiones y fallos) estaban llaveados SOLO por el recurso protegido — el correo —, que es justo
el dato que el atacante elige. Un límite así acota la fuerza bruta, pero el presupuesto es común: quien lo gasta
primero se lo quita al dueño. Además cada emisión reemplazaba "el" código vivo del correo, fuera de quien fuera.

## Prevención
- Todo presupuesto que un anónimo puede gastar se llavea por (recurso, ORIGEN del que llama), con un tope global por
  recurso bastante más alto que mantiene la cota finita. Origen = IPv4 o el /64 de una IPv6 (`otpOrigin`), sacado de
  una cabecera que el cliente no puede forjar (`clientIpOf`); sin cabecera confiable, un único origen compartido.
- Un código vivo por (correo, origen): pedir uno solo reemplaza el TUYO.
- Los fallos gastan intentos solo del código que pidió ESE origen. Un origen sin código propio usa un presupuesto
  "ajeno" aparte (10/h por correo) contra el código más nuevo, sin tocar sus `attempts` — así al dueño le sigue
  sirviendo el código aunque le cambie la IP, y un tercero no puede matarlo.
- Cota resultante: 15 × 5 + 10 = 85 intentos/hora por buzón (8.5·10⁻⁵). Lo que queda agotable por terceros está
  escrito en `state/security.md` (tope global de emisión: ≥ 3 redes; intentos ajenos: solo afecta a quien cambia de IP).
- Pregunta de revisión para cualquier límite nuevo: ¿quién elige la llave del contador? Si la elige quien llama y el
  contador es de otro, es un interruptor de apagado.
- De paso: las sentencias del gate viven como datos (`otp-sql.ts`) para que la prueba manual con Postgres ejecute el
  SQL que se despliega y no una copia. Trampa del harness: `now()` en una columna `timestamp` sin zona usa la zona de
  la sesión — sembrar filas con el instante como parámetro ISO, igual que el código.

---
id: 2026-09-24-credentials-authorize-alcanzable-por-el-callback
domain: security
guardrail: scripts/api-smoke.ts (writes, W1: un handoff usado re-jugado en `POST /api/auth/callback/otp` no da sesión; control positivo con uno fresco)
status: resolved
---

# Un "token de un solo uso" que solo se quema en la ruta propia se puede re-jugar contra el callback de Auth.js

## Síntoma
No llegó a producción: apareció en el diseño del handoff bearer → cookie (fase 4b). La idea era que la
ruta `GET /api/auth/handoff` hiciera el `DELETE … RETURNING` del `jti` y, si había fila, llamara a
`signIn("otp", { handoff })`. Con eso, una URL ya usada o filtrada en un log daba sesión igual si se
mandaba su `t` directo a `POST /api/auth/callback/otp`.

## Causa raíz
El provider Credentials de Auth.js v5 es alcanzable en `/api/auth/callback/<id>` para cualquiera que saque
un CSRF de `/api/auth/csrf`. Su `authorize` es la ÚNICA puerta común a toda sesión; una ruta propia es solo
una de las entradas. Cualquier condición que viva fuera de `authorize` (un solo uso, lista blanca, `tv`) se
salta por el callback.

## Prevención
- `consumeWebHandoff` (firma, `aud`, `exp`, quema de la fila, `tv`) corre DENTRO de `authorize`
  (`src/auth/config.ts`). La ruta GET solo valida `to` y delega.
- Los modos de `authorize` no se mezclan: si viene `handoff` es modo handoff y nunca cae a la verificación
  OTP. `verifyOtp` rechaza identificadores `handoff:*` porque la tabla `verificationToken` es compartida y el
  `email` del formulario web es texto libre.
- Guardrail: el smoke W1 re-juega un `t` usado contra el callback. El control positivo (uno fresco SÍ da
  sesión por ahí) asegura que el rechazo sea el de un solo uso y no un CSRF mal armado.
- El callejón sin salida: "el callback necesita CSRF, así que no es alcanzable". El CSRF protege contra
  un tercero que actúe en el navegador de la víctima, no contra quien ya tiene el token.

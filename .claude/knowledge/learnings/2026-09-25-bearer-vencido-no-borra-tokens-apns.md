---
id: 2026-09-25-bearer-vencido-no-borra-tokens-apns
domain: security
guardrail: src/modules/push/liveness.test.ts (regla pura `deviceTokenIsLive`); la query de `pushToUsers` y la poda del cron no tienen test con DB
status: resolved
---

# Un iPhone deslogueado por vencimiento seguía recibiendo los push de la cuenta anterior

## Síntoma
Encontrado en la revisión de la app iOS: una instalación cuyo bearer venció (30 días sin abrir la app,
o la app "olvidó" la sesión sin llamar a logout) seguía recibiendo "@x te sigue" y avisos de estreno de
la cuenta que ya no estaba en ese teléfono. Nada en los logs: APNs acepta el envío (200).

## Causa raíz
`pushToUsers` elegía los `device_token` SOLO por `user_id`. Las rutas que "cierran sesión" (logout,
`DELETE /me/sessions/{id}`, borrar cuenta) sí borran los tokens, pero **vencer no es un evento**: el
bearer muere en su `exp` sin tocar la base, y la fila de `device_token` (con su `session_id` todavía
no revocado) queda viva para siempre.

## Prevención
- Fix: `pushToUsers` hace LEFT JOIN a `mobile_session` y filtra con `deviceTokenIsLive`
  (`modules/push/liveness.ts`): sesión no revocada con `last_seen_at` dentro de la vida del bearer
  (`authz/token-ttl.ts`). Es correcto porque cada acuñación (login o `auth/refresh`) pasa por una
  request que estampa `last_seen_at` (≤ 10 min de retraso). Token sin sesión (bearer pre-4d) →
  `updated_at` en la ventana. El cron diario borra el complemento (`pruneStaleDeviceTokens`).
- Guardrail: `pnpm tsx --test src/modules/push/liveness.test.ts` (la regla y la ventana = TTL del bearer).
- El callejón sin salida: "logout ya borra los tokens, está cubierto". Cualquier estado que dependa de
  que el cliente AVISE que se fue (logout, desregistrar) necesita también un límite por tiempo del lado
  del servidor. Y no uses `device_token.updated_at` solo para sesiones con `sid`: el token puede
  re-registrarse ayer con una sesión cuyo último bearer ya murió.

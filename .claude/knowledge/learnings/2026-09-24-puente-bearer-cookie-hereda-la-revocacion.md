---
id: 2026-09-24-puente-bearer-cookie-hereda-la-revocacion
domain: security
guardrail: scripts/api-smoke.ts (auth: cookie con `tv` ≠ `token_version` → `/login`; writes W3: cookie de handoff previa al logout → `/login`)
status: resolved
---

# Un handoff bearer → cookie convertía un token revocable en una sesión de 30 días que el logout no tocaba

## Síntoma
No llegó a producción (review de seguridad de la fase 4b, hallazgo A1). `POST /auth/logout` revocaba todos los
bearers de la cuenta vía `users.token_version`, pero cualquiera con un bearer vivo podía pedir
`POST /auth/web-session`, abrir la URL y quedarse con una cookie de Auth.js de 30 días. Esa cookie no llevaba
versión, así que "cerrar sesión en todos lados" no la mataba: robar un bearer 1 minuto = sesión web 30 días.

## Causa raíz
La revocación se diseñó sobre el artefacto que se estaba construyendo (el bearer) y el puente hacia el otro
sistema de sesión (el JWT de Auth.js) no heredó la propiedad. Todo puente entre dos mecanismos de sesión
emite una credencial NUEVA; si ésta no lleva el mismo ancla de revocación, el puente es una forma de lavar
una credencial revocable en una que no lo es.

## Prevención
- `authorize` devuelve `tv` (handoff: el que ya validó; OTP: `readTokenVersion`), el callback `jwt` lo copia
  al token y `getCurrentUser` lo compara con la columna en la MISMA relectura que ya hacía. Mismatch = sesión
  nula, igual que una cookie inválida. Cookie pre-4b = 0 = default de la columna.
- Guardrails: el caso de `auth` cifra cookies de Auth.js con `AUTH_SECRET` (`encode` de `next-auth/jwt`, salt
  = nombre de la cookie) con `tv` adelantado / vigente / ausente contra `/backlogs` — corre HOY aunque la
  migración 0027 no esté aplicada; W3 hace el recorrido real (handoff → cookie → logout → `/login`).
- El callejón sin salida: "la cookie ya se relee por request, basta" — la relectura revoca por cuenta
  borrada/bloqueada, no por logout. Y ojo: `/api/auth/session` de Auth.js NO pasa por `getCurrentUser`
  (sigue mostrando el JWT de una cookie revocada); nada debe autorizar con él.

---
id: 2026-09-24-smoke-writes-compartido-rebasa-rate-limit-por-usuario
domain: backend
guardrail: none (es el smoke mismo el que lo sufre; el wrapper `e2call` en scripts/api-smoke.ts reintenta una vez tras 429 y deja el patrón a copiar en los demás bloques)
status: resolved
---

# La sección `writes` del smoke de la API v1 falla con 429 a mitad de camino sin que ningún handler esté mal

## Síntoma
`pnpm exec tsx scripts/api-smoke.ts --only writes` pasa docenas de casos y de pronto uno
(en la primera corrida real, el `DELETE /me/titles/{id}/review` de E3) muere con
`429 !== 204`. Repetir el caso a mano un minuto después responde 204. Como el runner aborta
en el primer FAIL, el `DELETE /me` final no corre y la cuenta QA queda viva en la DB (que ES
prod): hay que borrarla a mano (`delete from "user" where email like 'qa-api-…%'`).

## Causa raíz
`withApi` (src/authz/api.ts) limita a **60 escrituras por minuto por `sub`**, ventana
deslizante en memoria por instancia. Toda la sección `writes` corre sobre UNA cuenta QA y en
un solo minuto: los bloques de cuenta (E1, ~20 writes), colecciones/membresías/marca (E2, ~30)
y reseñas (E3, ~10) suman más que el techo. No es un bug de ningún endpoint ni del limiter —
es el smoke comportándose como el "cliente desbocado" que el limiter existe para frenar.

## Prevención
- Cada bloque de `writes` que haga más de un puñado de escrituras envuelve sus `call(...)`
  con un reintento acotado ante 429 (esperar `retryAfterSeconds`, reintentar una vez):
  `e2call` en `scripts/api-smoke.ts` es la referencia. NO subir `RATE_LIMIT_WRITES` para
  que pase el smoke: el límite es producto, el smoke es quien debe adaptarse.
- Si un `writes` aborta, la cuenta QA NO se borró sola: comprobar `select count(*) from
  "user" where email like 'qa-api-%'` antes de dar por cerrada la corrida.
- Callejón sin salida: leer el 429 como "el handler nuevo está roto" y ponerse a depurar el
  módulo. El `Retry-After` en la respuesta y el texto "Demasiadas peticiones seguidas" lo
  delatan en dos segundos.

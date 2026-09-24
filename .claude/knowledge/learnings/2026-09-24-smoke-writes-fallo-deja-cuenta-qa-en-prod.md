---
id: 2026-09-24-smoke-writes-fallo-deja-cuenta-qa-en-prod
domain: backend
guardrail: scripts/api-smoke.ts (`e1DeleteMe` va por `writes.push` después del literal y su último assert cuenta filas `qa-api-%` en la DB; si el runner aborta antes, la limpieza es manual)
status: resolved
---

# Un FAIL en `--only writes` del smoke deja una cuenta `qa-api-…` viva en la base de PRODUCCIÓN

## Síntoma
Tras correr `pnpm tsx scripts/api-smoke.ts --only writes`, `select email from "user" where email like 'qa-api-%'`
devuelve filas. También: el caso final "DELETE /me → 204" pasaba, pero los casos que otro carril anexó
después de él fallaban con 401 ("Tu sesión no es válida") aunque el endpoint estuviera bien.

## Causa raíz
Dos hechos del runner que no se ven a primera vista:
1. `main()` hace `process.exit(1)` en el **primer** caso que falla. Si el fallo ocurre antes del caso que
   borra la cuenta (`DELETE /me`), la cuenta QA — creada por `otp/verify` contra la DB compartida
   (local = beta = prod) — se queda.
2. Los casos corren en el orden del array `writes`. Con varios carriles anexando dentro del literal, el
   `DELETE /me` de E1 dejó de ser el último y los casos posteriores corrían sin cuenta.

## Prevención
- El caso `DELETE /me` vive en `const e1DeleteMe` y entra con `writes.push(e1DeleteMe)` justo antes de
  `const sections`, después del literal: cualquier caso anexado dentro del literal corre antes, siempre.
  **Nadie anexa nada después de ese `push`.**
- Su último assert (`e1CountQaRows() === 0`) es la comprobación de limpieza dentro del propio smoke.
- Tras cualquier corrida con FAIL: `delete from "user" where email like 'qa-api-%'` a mano (todo lo del
  usuario cascadea: `user_item`, `backlog`, `user_follow`, `user_avatar`, `item_review`). La cuenta menor
  de edad (`…-minor@`) nunca puede borrarse por API (su bearer ya es 401): el caso la borra por SQL en un
  `finally`.
- Callejón sin salida: "el 401 de los casos de abajo es un bug del endpoint". No — es que la cuenta ya no
  existe; mirar el orden del array antes de tocar el handler.

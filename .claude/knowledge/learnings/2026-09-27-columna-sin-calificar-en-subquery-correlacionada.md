---
id: 2026-09-27-columna-sin-calificar-en-subquery-correlacionada
domain: backend
guardrail: none (no hay test con DB en CI; lo atrapó un harness desechable contra Postgres 17 local — la regla de abajo es la defensa)
status: resolved
---

# `exists (… where f.follower_user_id = ${users.id})` lee siempre false en un select de UNA tabla

## Síntoma
`getFollowListsAccess` (listas de seguidores, 2026-09-27) devolvía `allowed: false` para dos
cuentas que se siguen mutuamente: las filas de `user_follow` estaban, pero el `exists` de la
arista dueño → viewer daba false. `tsc` limpio, sin error de SQL.

## Causa raíz
En un `db.select({...}).from(users)` SIN joins, Drizzle renderiza `${users.id}` dentro de un
`sql\`\`` como `"id"` a secas (solo califica con la tabla cuando la query tiene joins). Metido en
una subquery correlacionada — `select 1 from "user_follow" f where f.follower_user_id = "id"` —
Postgres resuelve `"id"` contra la tabla INTERNA (`user_follow.id`), no contra la fila externa de
`user`. La comparación es sintácticamente válida y siempre falsa. `notBlockedWith(viewerId,
users.id)` en esa misma query funcionaba por suerte: `user_block` no tiene columna `id`, así que
ahí `"id"` sí escapaba hacia afuera. `toSQL()` lo muestra: `select "id", exists (… = "id") from "user"`.

## Prevención
- Fix: `const OWNER_ID = sql\`${users}.${sql.identifier("id")}\`` (renderiza `"user"."id"`
  siempre) para toda referencia a la fila externa dentro de una subquery (`modules/social/follow-lists.ts`).
- Regla: en un select de una sola tabla, NUNCA interpoles `${tabla.col}` dentro de una subquery
  correlacionada; usa la forma calificada explícita. Las queries con join (las de
  `social/queries.ts`) sí salen calificadas, por eso el mismo patrón funciona allí — y por eso
  copiarlo a una query sin join rompe en silencio.
- Guardrail: ninguno ejecutable en CI (no hay DB de test). Se verificó con un harness desechable
  (Postgres 17 local con 0000–0031, `@/db` alias a `drizzle-orm/node-postgres`, `server-only`
  stub) — la receta está en `state/data.md` (0031).
- El callejón sin salida: sospechar de la semilla o del orden de inserción ("la arista no se
  escribió"). Las filas estaban; mira `toSQL()` antes de mirar los datos.

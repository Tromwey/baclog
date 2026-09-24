---
id: 2026-09-24-columna-declarada-sin-migrar-rompe-inserts
domain: data
guardrail: none (proceso: la DB es compartida y no hay entorno de migración aparte; el switch `TOKEN_VERSION_LIVE` en src/auth/user-row.ts y la línea comentada en schema.ts son el patrón a copiar)
status: resolved
---

# Declarar una columna en `schema.ts` antes de migrar tumba el `next dev` compartido: 500 en todo bearer y ninguna cuenta nueva

## Síntoma
En cuanto se guardó `tokenVersion: integer("token_version")…` en `users` (fase 4b, migración 0027 generada pero
sin aplicar) y la relectura del bearer la seleccionó, toda petición v1 con bearer dio 500 con
`42703 column "token_version" does not exist`, y el smoke del otro carril dejó de correr. Menos visible: el
alta de cuentas nuevas (web y `otp/verify`) también se rompe, aunque ningún código pida la columna.

## Causa raíz
La DB es UNA sola (local = beta = prod) y la migración espera la confirmación del founder, así que hay una
ventana en la que el código y la base no coinciden. Hay dos mecanismos:
1. Un `select` que nombra la columna (el obvio).
2. **Drizzle nombra TODAS las columnas de la tabla en cada `insert`** (`buildInsertQuery`: las no provistas
   van como `default`). Con la columna solo declarada en `schema.ts`, `insert(users)` de `verifyOtp` falla.
   Lo mismo pasa con un `select()` / `.returning()` sin lista de campos (el de `verifyOtp` lo hacía).

## Prevención
- Mientras la migración no esté aplicada: la columna va **comentada** en `schema.ts`. El código que la usa la
  lee y escribe con SQL crudo (compila con o sin la línea), detrás de un switch (`TOKEN_VERSION_LIVE = false`)
  que vuelve a la conducta previa. Al migrar, en este orden: `drizzle-kit migrate` → descomentar → switch a `true`.
- Con la línea comentada y el snapshot de la migración ya generado, **nadie corre `drizzle-kit generate`**:
  el diff emitiría un `DROP COLUMN` (primo del learning 2026-09-02-migracion-a-mano-sin-snapshot).
- `verifyOtp` usa ahora una lista explícita (`OTP_USER_COLUMNS`) en el select y en el `returning`. Así, una
  columna futura ya no rompe el login de cuentas existentes, aunque el INSERT de una cuenta nueva seguirá
  nombrándola.
- El callejón sin salida: "el 500 es del select, lo quito y listo". El INSERT sigue roto mientras la
  columna esté declarada, y el síntoma solo aparece cuando alguien se registra (o cuando el smoke `writes`
  crea su cuenta QA).

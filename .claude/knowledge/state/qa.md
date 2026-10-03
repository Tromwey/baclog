# Estado · QA

> Actualizado: 2026-10-01. El inventario completo de checks (qué atrapa cada uno y qué NO atrapa nadie) es `../guardrails.md`; esto es solo el mapa.

## Capas
- **Tests puros** — `pnpm test` (`scripts/run-tests.sh`: todos los `src/**/*.test.ts` con `node:test` bajo tsx; sin DB ni red). Parte de `pnpm check` (typecheck + lint + guardrails + test).
- **Harness de DB** — `pnpm test:db` (`scripts/run-test-db.sh`): `scripts/db-harness/run.ts` (módulos, crons y server actions REALES) y `scripts/otp-sql-harness.ts`, contra un Postgres LOCAL desechable en loopback arrancado con `-c timezone=UTC` (receta en la cabecera de `run.ts`; se niega a cualquier otro host, TRUNCA). Manual: no corre en `pnpm check` ni en CI.
  - Dobles del harness (`scripts/db-harness/tsconfig.json`): `@/db` (node-postgres), `@/auth/mailer`, `@/auth/session` (solo la rama `apiContext`; para actuar como un usuario: `apiContext.run({ user }, fn)`).
  - Un caso que escribe y debe dejar la base como estaba puede usar `begin`/`rollback` (el pool es de UNA conexión).

## Sin cubrir
- Nada ejercita el navegador (no hay e2e): scroll infinito de colecciones, hojas, gestos.
- La rama de cookie de `getCurrentUser` (Auth.js) no corre en ningún harness.
- `/api/v1` end to end: `scripts/api-smoke.ts`, manual, contra un servidor levantado.

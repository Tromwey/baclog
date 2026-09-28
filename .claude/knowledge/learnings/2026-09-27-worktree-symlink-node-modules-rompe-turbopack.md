---
id: 2026-09-27-worktree-symlink-node-modules-rompe-turbopack
domain: infra
guardrail: none (entorno de worktree; la regla vive aquí y en los briefs de agentes)
status: resolved
---

# `next build` / `pnpm dev` en un worktree: "Symlink [project]/node_modules is invalid"

## Síntoma
En un git worktree con `node_modules` como symlink al repo padre, `pnpm build` y `pnpm dev` (Turbopack) fallan con `TurbopackInternalError: Symlink [project]/node_modules is invalid, it points out of the filesystem root`. `tsc` y `eslint` sí funcionan.

## Causa raíz
Turbopack no sigue symlinks que salen de la raíz del proyecto. El symlink es necesario para no reinstalar dependencias en cada worktree.

## Prevención
- En el worktree: verificar con `npx tsc --noEmit` + `pnpm lint`; para runtime usar `pnpm exec next dev --webpack -p <puerto>`.
- El `next build` de verdad se corre en el repo padre después del merge a `main`, antes de `vercel deploy --prod`.
- Relacionado: tras borrar rutas o correr un dev server distinto, `tsc` puede fallar con errores en `.next/dev/types/*` (tipos generados viejos) — `rm -rf .next/dev` y volver a correr; no es un error del código.

---
id: 2026-09-27-export-type-en-use-server-rompe-turbopack
domain: frontend
guardrail: none (no hay tests; `next build` pasa — solo falla el loader de server actions en dev/runtime)
status: resolved
---

# "ReferenceError: BacklogVisibility is not defined" al llamar cualquier acción de backlog-actions

## Síntoma
En `next dev` (Turbopack), toda server action de `src/app/actions/backlog-actions.ts` respondía 500 con
`ReferenceError: BacklogVisibility is not defined` en `…/page/actions.js (server actions loader)`. `tsc`,
`eslint` y `next build` salían limpios.

## Causa raíz
El archivo `"use server"` re-exportaba un TIPO (`export type { BacklogVisibility }`). El loader de server
actions de Turbopack lo trató como export de valor al generar el módulo de la ruta.

## Prevención
- Un archivo `"use server"` exporta SOLO funciones async. Los tipos se importan de su módulo de origen
  (`@/modules/backlog/visibility`), nunca a través del archivo de acciones.
- Verificarlo ejecutando la acción (no basta con el build): el error solo aparece al cargar el loader.

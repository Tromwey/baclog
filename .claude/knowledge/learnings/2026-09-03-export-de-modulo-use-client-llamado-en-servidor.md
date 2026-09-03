---
id: 2026-09-03-export-de-modulo-use-client-llamado-en-servidor
domain: frontend
guardrail: none (Next no lo atrapa en `tsc` ni en `next build`; solo explota en runtime al renderizar esa ruta — la receta es mover el helper a un módulo plano)
status: resolved
---

# `Attempted to call visibilityOf() from the server but visibilityOf is on the client`

## Síntoma
`npx tsc --noEmit` y `next build` limpios, y al abrir `/backlogs/[id]` en runtime: overlay rojo de Next
`Attempted to call visibilityOf() from the server but visibilityOf is on the client. It's not possible
to invoke a client function from the server…` señalando `backlog-zoom-view.tsx` (server component).

## Causa raíz
`visibilityOf` (y `VISIBILITY_STATES`) estaban exportados desde `components/backlog-visibility-segments.tsx`,
un módulo `"use client"`. TODO export de un módulo cliente se convierte en una *client reference* al
importarse desde el servidor: una función se vuelve un proxy que no se puede llamar, y una constante
string (p. ej. `glassChipClass`, `followPillClass`) llega como objeto. TypeScript no ve la frontera, así
que el tipo es correcto y el error es exclusivamente de runtime, en la ruta que lo usa.

## Prevención
- Helpers puros y recetas de clases que se comparten entre server y client components viven en módulos
  PLANOS (sin `"use client"`): `modules/backlog/visibility.ts`, `components/ui/glass.ts`,
  `components/follow-pill.ts`. El módulo cliente los re-importa; no al revés.
- Chequeo rápido antes de cerrar un PR grande: listar los `"use client"` y grep de sus exports en
  minúscula (helpers/constantes) importados desde archivos sin la directiva. El script ad hoc de esta
  sesión encontró `followPillClass` además del caso que explotó.
- El callejón sin salida: confiar en `tsc`/`build` verdes como prueba de que una ruta renderiza. Con
  cinco agentes en paralelo cada uno pasó `tsc`; el bug solo apareció al abrir la pantalla.

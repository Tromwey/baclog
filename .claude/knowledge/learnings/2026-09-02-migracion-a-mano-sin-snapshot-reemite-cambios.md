---
id: 2026-09-02-migracion-a-mano-sin-snapshot-reemite-cambios
domain: data
guardrail: none (proceso — revisar el SQL generado antes de commitear; ver Prevención)
status: resolved
---

# `drizzle-kit generate` re-emite cambios de una migración anterior escrita a mano

## Síntoma
Al generar la migración 0026 (`user_avatar`, una tabla nueva), el SQL salió con dos líneas extra al
principio: `ALTER TYPE "link_service" ADD VALUE 'tidal' BEFORE 'netflix'` y
`ALTER TYPE "preferred_service" ADD VALUE 'tidal'` — cambios que la 0025 ya había aplicado en la DB.
Aplicar 0026 tal cual habría fallado (`enum label "tidal" already exists`) a mitad de migración.

## Causa raíz
La 0025 (`tidal_service`) se escribió **a mano**: existe `drizzle/0025_tidal_service.sql` y su entrada
en `drizzle/meta/_journal.json`, pero **no hay `drizzle/meta/0025_snapshot.json`**. drizzle-kit
calcula el diff contra el ÚLTIMO snapshot que encuentra (0024, sin `tidal`), así que para él el enum
seguía sin el valor y lo volvió a emitir. El `BEFORE 'netflix'` viene de que el orden del valor en
`schema.ts` no coincide con el orden real en la DB (donde se agregó al final).

## Prevención
- Si se escribe una migración a mano, generar igual el snapshot: correr `drizzle-kit generate` con el
  esquema ya cambiado y **descartar el SQL** que produzca (o usarlo como la migración), pero conservar
  `meta/NNNN_snapshot.json` y el journal. Sin snapshot, la siguiente migración generada arrastra el diff.
- Siempre **leer el SQL generado línea por línea** antes de commitearlo: el generate de 0026 se limpió
  a mano (se quitaron las dos líneas de `tidal`) y su snapshot es ahora el primero que incluye `tidal`,
  así que el problema no se propaga a 0027.
- El callejón: "el generate solo pone lo que cambié en el esquema". No: pone lo que difiere del último
  snapshot, que puede estar atrasado respecto a la DB real.

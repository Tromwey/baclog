---
id: 2026-09-24-campo-aditivo-en-select-rompe-tipos-construidos-a-mano
domain: backend
guardrail: none (lo atrapa `npx tsc --noEmit`, pero en archivos AJENOS al que editaste — el guardrail es la regla de abajo, no un test)
status: resolved
---

# Agregar una columna "aditiva" al select de `getBacklogItems` rompe `tsc` en `recap.ts` y en la página de la card

## Síntoma
Al sumar `userItemAddedAt` y `reviewId` al `db.select({...})` de `getBacklogItems` (para `GET /api/v1/collections/{id}`),
`tsc` falla en `src/modules/backlog/recap.ts:49` y `src/app/(app)/item/[catalogItemId]/card/page.tsx:32` con
"missing the following properties … userItemAddedAt, reviewId". Ninguno de los dos llama a la query.

## Causa raíz
`BacklogItemWithCatalog` (adapter de cards) es `Awaited<ReturnType<typeof getBacklogItems>>[number]`: el tipo se
INFIERE del select. `recap.ts` (`fetchUserItems`) y la página de la card construyen ese tipo **a mano** con otro
select / otro objeto. Cualquier columna nueva en la query "fuente" se vuelve obligatoria para todos los que
fabrican la forma sin pasar por ella. "Aditivo" en la DB no es aditivo en un tipo inferido que otros satisfacen
estructuralmente.

## Prevención
- Fix: las columnas viven en una constante `backlogItemColumns` en `queries.ts`; `getBacklogItems` la selecciona tal
  cual (tipo idéntico al de antes) y la API usa una query hermana `getBacklogItemsWithState` = `{ ...backlogItemColumns,
  userItemAddedAt, reviewId }` + `leftJoin(item_review)`. Nadie fuera del handler cambia.
- Regla: antes de tocar el select de una query, `grep -rn "ReturnType<typeof <fn>>" src` — si alguien deriva un tipo de
  ella y lo construye por otro camino, agrega un lector hermano (o un `Pick`), no columnas.
- El callejón sin salida: "arreglar" `recap.ts` y `card/page.tsx` agregando los campos nuevos con `null` — propaga
  campos de la API a la pipeline de cards, que no los necesita, y en un carril paralelo pisa archivos ajenos.

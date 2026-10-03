# Pasar un orden del cliente a un keyset SQL cambia los empates

**Fecha:** 2026-10-01 · **Dominio:** backend / frontend (colecciones paginadas, ronda 8)

## Síntoma
"Recientes" de una colección copiada (o de cualquier lote agregado en la misma sentencia: `added_at` idéntico en N filas) salía en un orden arbitrario — el de los uuid de membresía — en vez del orden manual que mostraba antes.

## Causa
Antes el cliente ordenaba con `Array.prototype.sort`, que es ESTABLE, sobre la lista ya leída en orden manual: en un empate de `addedAt` sobrevivía el orden manual (`position`). El keyset nuevo era `addedAt DESC, id DESC`: correcto como paginación (único, sin repetidos ni huecos) pero con otro desempate. Ningún test puro lo veía: `compareRows` (el gemelo JS) tenía el mismo desempate que el SQL, así que los dos coincidían entre sí y ninguno con el comportamiento anterior.

## Fix
`recent` = `addedAt DESC · position ASC NULLS FIRST · id DESC` (`CURSOR_ORDER` en `src/modules/backlog/collection-cursor.ts`; el SQL de `queries.ts` recorre la misma lista).

## Regla
Al reemplazar un sort estable en memoria por un ORDER BY, las llaves del orden de ENTRADA de ese sort son llaves secundarias del orden nuevo. Y el oráculo de un test de orden tiene que ser el comportamiento anterior (la función vieja), no un gemelo escrito junto con el código nuevo.

## Guardrail
`pnpm test:db` casos 37–40: cada orden paginado contra `getBacklogItems` + el `sortItems` anterior, con 40 filas del mismo instante.

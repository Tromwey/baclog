---
id: 2026-09-24-new-date-no-valida-un-cursor
domain: backend
guardrail: scripts/check-wire.ts ("cursor keyset: …") + scripts/api-smoke.ts (`/feed` y `/titles/{id}/reviews` con `"1|x"` y `"0000-01-01T00:00:00.000Z|x"` → 400 `fields.cursor`)
status: resolved
---

# Un cursor forjado pasa `decodeCursor`: `"1|x"` sirve una página inventada y el año `0000` da 500

## Síntoma
`GET /api/v1/feed?cursor=0000-01-01T00:00:00.000Z|x` (y `/me/following`, `/me/followers`,
`/titles/{id}/reviews`) responde 500 `internal` en vez de 400 `fields.cursor` (error de Postgres al
comparar el timestamp). Y `?cursor=1|x` ni siquiera falla: responde 200 con la página "anterior a
2001-01-01", un cursor que el servidor jamás emitió tratado como válido.

## Causa raíz
`decodeCursor` validaba la mitad de instante con `!Number.isNaN(new Date(half).getTime())`. Eso NO
es validar un ISO: V8 acepta casi cualquier cosa — `new Date("1")` es 2001-01-01 en hora local,
`new Date("2026")` es un año suelto, `new Date("2026-02-30…Z")` rueda a marzo — y `new Date("0000-…")`
es una fecha válida para JS cuyo `toISOString()` Postgres rechaza (año 0 / negativo). Así que el
cursor "pasaba", `readCursor` no daba 400, y el valor o se usaba tal cual o explotaba en la query.

## Prevención
- Fix (`src/modules/reviews/cursor.ts`, puro): la mitad de instante tiene que casar con
  `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$` (lo que emite `encodeCursor`), año ≥ 2000, y
  sobrevivir el round trip `toISOString()` (mata `02-30`). La mitad de id sigue opaca en el codec (el
  feed usa `kind:rowId`); `readCursor(req, { uuidId: true })` la exige UUID donde es un id de fila.
- Guardrail: `check-wire` prueba el codec sin DB; el smoke manda los cursores forjados a `/feed` y a
  `/titles/{id}/reviews`.
- El callejón sin salida: "`isNaN(date)` basta". `Date` es un parser permisivo, no un validador;
  para un formato que TÚ produces, valida ese formato exacto.

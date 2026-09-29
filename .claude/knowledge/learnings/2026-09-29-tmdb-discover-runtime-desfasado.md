---
id: 2026-09-29-tmdb-discover-runtime-desfasado
domain: backend
guardrail: scripts/api-smoke.ts (reads, "GET /discover/formats/…" — la ventana 100–130 de `time=1`)
status: resolved
---

# Cine «hasta dos horas» muestra una película de 90 min

## Síntoma
`api-smoke --only reads --grep formats` falla con "runtime dentro de la ventana": `GET /api/v1/discover/formats/film` (time=1, 100–130 min) devuelve *Minions & Monsters* (TMDB 1315772) con `runtimeMinutes: 90`.

## Causa raíz
`/discover/movie?with_runtime.gte=100&with_runtime.lte=130` filtra con el índice de discover de TMDB, que va desfasado respecto al detalle: para 1315772 discover todavía la mete en 100–130 mientras `/movie/1315772` ya dice `runtime: 90` (película recién estrenada; el runtime placeholder de antes del estreno sigue en el índice). Nosotros pintamos el runtime del DETALLE (`getFilmRuntime`), así que el filtro del proveedor y el número de la tarjeta no coinciden.

## Prevención
- `getCineShelf` (`src/modules/catalog/format-shelves.ts`) re-chequea la ventana contra el runtime que lleva la tarjeta (`fitsWindow`) y descarta las que caen fuera; un runtime desconocido pasa y va al final, como antes.
- Guardrail: el caso de formatos de `scripts/api-smoke.ts` ya comprueba la ventana; ahora el mensaje nombra el título y su id.
- Callejón sin salida: no "arreglarlo" pidiendo a TMDB otra ventana ni quitando la aserción del smoke — el filtro de discover es una sugerencia, no una garantía. Cualquier otro filtro de discover sobre un hecho que también leamos del detalle (fecha, votos) tiene el mismo desfase.

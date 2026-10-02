---
id: 2026-10-02-degradado-del-feed-cortado-en-paginas-cortas
domain: frontend
guardrail: none (iOS sin snapshot tests; el fix vive en `kFeedSurface`, el único punto por el que pasan todas las páginas)
status: resolved
---

# iOS: el degradado de una colección corta se corta en seco a media pantalla

## Síntoma
Una colección con 1–2 títulos (o cualquier página con `kFeedSurface` más corta que ~920 pt): el
degradado del feed termina en una línea horizontal justo debajo del contenido y abajo sigue un
bloque plano del tono de cola (`Tint.feedTail`). Con muchos títulos no se ve.

## Causa raíz
`kFeedSurface` pinta `FeedSurface` como `.background` del CONTENIDO del scroll, así que mide lo que
mide el contenido. El degradado llega al tono 2 a `span` puntos (900) sobre la línea de 168°; si el
contenido acaba antes, la superficie se corta a medio camino y el `feedTail` detrás (ya en tono 2)
no empalma.

## Prevención
- `kFeedSurface` da a la superficie `minHeight = span / cos 12°` (alineada arriba): los backgrounds
  no se recortan al frame del contenido, así que el degradado completa su recorrido y empalma con
  la cola. Arregla de una vez colección, perfiles, ficha, creador, "no puedo esperar".
- NO lo arregles con `minHeight` de pantalla en el VStack de una sola vista: cambia el layout
  (centra/estira el cuerpo) y deja las demás páginas con el mismo corte.

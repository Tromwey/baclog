---
id: 2026-09-29-apple-music-playlist-borrada-sigue-respondiendo
domain: frontend
guardrail: none (comportamiento de la API de Apple; solo se ve con una cuenta real — el mock no lo reproduce)
status: resolved
---

# Tras borrar la playlist en Música, re-exportar dice "lista." y no crea nada

## Síntoma
El founder exportó la fiesta a Apple Music, borró la playlist en la app Música y volvió a exportar: la pantalla saltó a "lista. 1 de 1 canciones ya están en tu playlist" en menos de un segundo, sin crear otra. En la DB, `party_export` seguía con el mismo `remote_playlist_id` y la canción como `added`.

## Causa raíz
`GET /v1/me/library/playlists/{id}` sigue respondiendo (no 404) un rato después de borrar la playlist en el dispositivo — el borrado tarda en sincronizar. El cliente usaba ese GET como prueba de existencia y además solo mandaba las canciones `pending` según el servidor, así que con todo "added" no había nada que agregar y no llegaba nunca a la llamada que sí habría fallado.

## Prevención
- `AppStore+MusicExport.runAppleMusic` pasa TODAS las canciones de la fiesta y agrega las que no están de verdad dentro (`playlistCatalogIDs`); si `POST …/tracks` da 404 → `AppleMusicFailure.playlistGone` → playlist nueva + reporte `replace:true` + toda la fiesta otra vez.
- Guardrail: ninguno ejecutable (necesita una biblioteca real de Apple Music).
- Callejón: no fiarse del GET de la playlist ni del estado del servidor como verdad sobre la biblioteca remota; la única prueba fiable es la escritura.

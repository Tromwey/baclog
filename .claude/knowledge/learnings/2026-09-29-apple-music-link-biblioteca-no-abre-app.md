---
id: 2026-09-29-apple-music-link-biblioteca-no-abre-app
domain: frontend
guardrail: none (depende de la app Música de iOS)
status: resolved
---

# "Abrir en Apple Music" muestra "Item Not Available" aunque la playlist existe

## Síntoma
Tras exportar, el botón abría la app Música con "Item Not Available — not currently available in your country or region", pero la playlist sí aparecía en Biblioteca › Playlists.

## Causa raíz
El servidor arma `https://music.apple.com/library/playlist/p.…` (`applePlaylistUrl`), que solo funciona en el reproductor web. La app Música no resuelve rutas `/library/…`, y una playlist privada de biblioteca no tiene id público (`playParams.globalId` = `pl.u-…` solo existe si el usuario la comparte), así que no hay link que la abra directo. No es un problema de región pese al mensaje.

## Prevención
- iOS: "Abrir Apple Music" intenta `globalId` → `music.apple.com/playlist/pl.u-…`, si no abre `music://`, y el texto de "lista." dice dónde quedó la playlist.
- Guardrail: ninguno (comportamiento de la app Música).
- Callejón: no volver la playlist pública solo para tener link (decisión pendiente del founder: aparecería en su perfil de Apple Music); no creer el "not available in your region".

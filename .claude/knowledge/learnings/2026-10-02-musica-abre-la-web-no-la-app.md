---
id: 2026-10-02-musica-abre-la-web-no-la-app
domain: frontend
guardrail: none (comportamiento del SO con universal links / app links; se verifica tocando en un teléfono con la app de Spotify instalada)
status: resolved
---

# "Abrir en Spotify" abre la web de Spotify en lugar de la app

## Síntoma
Un usuario con Spotify toca "Abrir en Spotify" en la ficha de un álbum (iOS, web en el iPhone) y aterriza en `open.spotify.com` en el navegador, no en la app.

## Causa raíz
El botón apuntaba a NUESTRO `/api/links/resolve` (302 → `open.spotify.com/search/…`). iOS solo entrega un enlace a otra app (universal link) cuando el TOQUE va directo a su host; tras una redirección desde nuestro dominio se queda en Safari/el navegador y carga el reproductor web. El AASA de Spotify sí cubre `/album/*` y `/search/*`: el problema era el salto, no la ruta.

## Prevención
- `/api/links/resolve?…&format=json` → `{ url }` (sin 302). iOS (`MusicLink.direct`) y Android (`directMusicLink`) piden ese JSON y abren el enlace final; si falla, abren el resolve como antes (apps viejas siguen con el 302).
- Web: `directMusicLink(item, service)` (`modules/links/resolve.ts`) pone el enlace final en el `href` cuando no hace falta llamar a nadie (Apple Music del catálogo, búsqueda de Spotify / YouTube Music). TIDAL sigue detrás del resolve (su enlace exacto requiere su API).
- Callejón sin salida: navegar por JS (`window.location`) al enlace final tampoco dispara el universal link en iOS de forma fiable; tiene que ser el `href` del toque.
- Aparte y sin resolver: Spotify abre una BÚSQUEDA, no el álbum exacto (su Web API exige cuenta Premium de desarrollador desde 2026-02; decisión del founder pendiente, ver `modules/links/resolve.ts`).

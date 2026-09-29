---
id: 2026-09-29-liga-musica-servicio-viejo
domain: frontend
guardrail: none (iOS sin tests de UI para la ficha; el fix vive en `musicURL` de TitleDetailView.swift)
status: resolved
---

# iOS: "Abrir en Apple Music" abre Tidal tras cambiar de app de música

## Síntoma
En Ajustes cambias la app de música (Tidal → Apple Music). La ficha de un álbum ya muestra
"Abrir en Apple Music" (el label lee `store.musicApp`, que cambia al instante), pero el botón
abre Tidal.

## Causa raíz
`GET /api/v1/titles/{id}` devuelve `watch[0].url = /api/links/resolve?…&service=<wire>` con el
servicio **fijado al momento del fetch** (la app no tiene cookie, así que el route no puede leer la
preferencia). El `Title` queda cacheado en `AppStore`, así que al cambiar de servicio el label se
actualiza pero la URL sigue diciendo `service=tidal`.

## Prevención
- `musicURL` re-fija el query param `service` al `store.musicApp` actual antes de abrir
  (`repinnedService`). `?service=` gana sobre la sesión en `/api/links/resolve`, así que basta.
- Callejón sin salida: invalidar/re-fetchear todos los títulos al cambiar de servicio — más caro y
  aún deja una ventana (PATCH en vuelo) donde la liga vieja se abre.
- Regla general: cualquier URL del API que lleve una **preferencia del usuario** horneada no debe
  usarse tal cual desde un modelo cacheado; derívala del estado local vigente.

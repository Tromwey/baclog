---
id: 2026-09-27-handoff-singleton-y-strict-mode
domain: frontend
guardrail: none (comportamiento de React dev/StrictMode; no hay test de runtime de transiciones)
status: resolved
---

# La transición de "abrir desde el perfil" no volaba: el abanico aparecía en reposo

## Síntoma
En dev, tocar un abanico del perfil abría el overlay de la colección SIN vuelo (aparecía en reposo, como un back-nav), aunque el toque sí se registraba en `fan-flight.ts`.

## Causa raíz
Dos causas apiladas:
1. **StrictMode ejecuta dos veces el `useLayoutEffect` de montaje.** El primer run hacía `takeFanFlight()` (que consume el singleton y lo deja en `null`), el cleanup lo descartaba, y el segundo run ya no encontraba el toque → caía a "sin toque = en reposo".
2. **Ventana de frescura corta vs compilación en frío de dev**: la ruta interceptada tardaba >1.5 s en montarse la primera vez, y el toque caducaba.

## Prevención
- Un singleton de "hand-off" que se CONSUME al leerlo se toma **una vez por instancia**, guardado en un ref (`s.rec ??= take…()`), no dentro del efecto a secas. Aplica a `collection-overlay.tsx`; `CoverFlightTarget`/`CoverFlightLayer` no consumen al montar, por eso no lo sufren.
- `FRESH_MS` de `fan-flight.ts` = 5 s (el id tiene que coincidir, así que una ventana larga no confunde aperturas).
- Callejón sin salida: concluir que la interceptación de `perfil/@modal/(..)backlogs/[backlogId]` no funciona. Sí funciona; el overlay montaba bien, solo sin vuelo.

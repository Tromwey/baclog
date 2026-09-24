---
id: 2026-09-24-ios-tabs-montadas-al-arrancar-cargan-antes-de-tiempo
domain: frontend
guardrail: none (comportamiento de SwiftUI; el recorrido real en simulador lo atrapa, `ios/README.md` › Backend real)
status: resolved
---

# El feed de iOS salía en blanco tras el onboarding: su `.task` corrió al arrancar, antes del primer follow

## Síntoma
En el recorrido real contra `/api/v1`, después del onboarding (seguir a alguien en "tu gente") la pestaña Feed mostraba un bloque gris sin cards ni estado vacío. El log del dev server tenía `GET /feed 200` **antes** del `PUT /me/following/...`, y ningún `GET /feed` después.

## Causa raíz
`MainTabs` monta las cuatro `NavigationStack` a la vez en un `ZStack` (cambio de pestaña instantáneo). Cualquier `.task { await store.load…() }` de la raíz de una pestaña corre en el primer frame de la app, no cuando el usuario entra a esa pestaña. El feed se cargó vacío con `following = []`, `feedLoaded = true` lo dio por bueno, y el follow posterior no lo invalidó. Además, "cargado pero vacío" no tenía estado propio: solo existía E1 (sin seguidos) y el stack.

## Prevención
- El fix: `AppStore.feedStale` compara el set de seguidos con el que construyó el feed; `FeedView` recarga con `.onChange(of: store.tab)` cuando se muestra estando stale, y tiene estado "tu gente todavía no hace nada" para el caso cargado-vacío.
- Regla para cualquier pestaña raíz en `ios/`: un `.task` en la raíz de una pestaña es "al arrancar la app", no "al abrir la pestaña". Si el dato depende de algo que el usuario cambia después (seguidos, biblioteca), la carga necesita una clave de invalidación o un `.onChange(of: store.tab)`.
- Sin guardrail ejecutable: no hay tests de UI en `ios/`. Lo atrapa el recorrido real (`ios/README.md` › Backend real); anotado en `state/frontend.md`.
- El callejón: creer que basta con `.task` como en una pantalla empujada por `NavigationStack` (esas sí se montan al entrar). Las pestañas no.
